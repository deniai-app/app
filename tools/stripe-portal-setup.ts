/**
 * Idempotently create (or re-sync) the Stripe Customer Portal configuration
 * used for Deni AI billing portal sessions.
 *
 * Plan and seat changes must go through the app (`changePlan`/`changeTeamPlan`
 * and team seat sync), so this configuration disables subscription updates.
 * Cancellation happens at period end, which the app treats as a grace period.
 *
 * Usage:
 *   pnpm run tools:stripe-portal           Create or update; prints the ID to set
 *                                          as STRIPE_PORTAL_CONFIGURATION_ID.
 *   pnpm run tools:stripe-portal --check   Read-only: report whether the portal
 *                                          configuration in use allows plan changes.
 *
 * The package script loads `.env.local`. For another environment, pass its file:
 *   pnpm exec tsx --env-file=.env.production ./tools/stripe-portal-setup.ts
 */
import Stripe from "stripe";

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

const stripe = new Stripe(secret);

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const unknownArgs = args.filter((arg) => arg !== "--check");
if (unknownArgs.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArgs.join(" ")} (supported: --check)`);
}
const checkOnly = args.includes("--check");

const MANAGED_METADATA = { managed_by: "deni-ai", purpose: "customer_portal" } as const;

/** Only link public HTTPS pages from the portal; sessions always pass return_url. */
function publicAppUrl() {
  const raw = process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  return url.protocol === "https:" ? url : null;
}

function portalConfigurationParams(): Stripe.BillingPortal.ConfigurationCreateParams {
  const appUrl = publicAppUrl();
  if (!appUrl) {
    console.warn(
      "NEXT_PUBLIC_BETTER_AUTH_URL is not an https URL; omitting business profile links and the default return URL.",
    );
  }

  return {
    name: "Deni AI (plan changes in app)",
    metadata: { ...MANAGED_METADATA },
    features: {
      // In-portal plan/seat changes would bypass app proration, payment, metadata and Max Mode handling.
      subscription_update: { enabled: false },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
      },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "name", "address", "tax_id"],
      },
    },
    login_page: { enabled: false },
    ...(appUrl
      ? {
          business_profile: {
            privacy_policy_url: new URL("/legal/privacy-policy", appUrl).toString(),
            terms_of_service_url: new URL("/legal/terms", appUrl).toString(),
          },
          default_return_url: new URL("/settings/billing", appUrl).toString(),
        }
      : {}),
  };
}

async function findManagedConfiguration() {
  const matches: Stripe.BillingPortal.Configuration[] = [];
  for await (const configuration of stripe.billingPortal.configurations.list({
    active: true,
    is_default: false,
    limit: 100,
  })) {
    if (
      configuration.metadata?.managed_by === MANAGED_METADATA.managed_by &&
      configuration.metadata?.purpose === MANAGED_METADATA.purpose
    ) {
      matches.push(configuration);
    }
  }
  if (matches.length > 1) {
    console.warn(
      `Found ${matches.length} managed portal configurations; using ${matches[0]?.id}. Deactivate the others in Stripe.`,
    );
  }
  return matches.at(0) ?? null;
}

async function findDefaultConfiguration() {
  const listed = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  return listed.data.at(0) ?? null;
}

function describe(label: string, configuration: Stripe.BillingPortal.Configuration) {
  const { subscription_update: update, subscription_cancel: cancel } = configuration.features;
  const state = [configuration.livemode ? "live" : "test", configuration.active ? null : "inactive"]
    .filter(Boolean)
    .join(", ");
  console.log(`${label}: ${configuration.id} (${state})`);
  console.log(
    `  subscription_update: ${
      update.enabled
        ? `ENABLED (${update.default_allowed_updates.join(", ") || "no update types"})`
        : "disabled"
    }`,
  );
  console.log(`  subscription_cancel: ${cancel.enabled ? `enabled (${cancel.mode})` : "disabled"}`);
  console.log(
    `  payment_method_update: ${configuration.features.payment_method_update.enabled ? "enabled" : "disabled"}`,
  );
  console.log(
    `  invoice_history: ${configuration.features.invoice_history.enabled ? "enabled" : "disabled"}`,
  );
}

async function check() {
  const pinnedId = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() || null;
  const [defaultConfiguration, pinnedConfiguration] = await Promise.all([
    findDefaultConfiguration(),
    pinnedId ? stripe.billingPortal.configurations.retrieve(pinnedId) : null,
  ]);

  if (defaultConfiguration) {
    describe("Default configuration", defaultConfiguration);
  } else {
    console.log(
      "Default configuration: none (save the customer portal settings in the Stripe Dashboard first).",
    );
  }
  if (pinnedConfiguration) {
    describe("STRIPE_PORTAL_CONFIGURATION_ID", pinnedConfiguration);
  } else {
    console.log("STRIPE_PORTAL_CONFIGURATION_ID: unset (sessions use the default configuration).");
  }

  const effective = pinnedConfiguration ?? defaultConfiguration;
  if (!effective) {
    console.error("No portal configuration is available for portal sessions.");
    process.exitCode = 1;
    return;
  }
  if (!effective.active) {
    console.error(`${effective.id} is inactive; portal sessions using it will fail.`);
    process.exitCode = 1;
  }
  if (effective.features.subscription_update.enabled) {
    console.error(
      `UNSAFE: ${effective.id} lets customers change plans or seat quantities in the portal, bypassing the app. ` +
        "Run `pnpm run tools:stripe-portal` and set STRIPE_PORTAL_CONFIGURATION_ID, or disable subscription updates on the default configuration in the Dashboard.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(`OK: ${effective.id} does not allow subscription updates.`);
}

async function setup() {
  const params = portalConfigurationParams();
  const existing = await findManagedConfiguration();
  const configuration = existing
    ? await stripe.billingPortal.configurations.update(existing.id, params)
    : await stripe.billingPortal.configurations.create(params);

  describe(
    existing ? "Updated portal configuration" : "Created portal configuration",
    configuration,
  );
  console.log("\nSet this in the app environment:");
  console.log(`STRIPE_PORTAL_CONFIGURATION_ID=${configuration.id}`);

  const defaultConfiguration = await findDefaultConfiguration();
  if (defaultConfiguration?.features.subscription_update.enabled) {
    console.warn(
      `\nNote: the default configuration ${defaultConfiguration.id} still allows subscription updates; ` +
        "it applies whenever STRIPE_PORTAL_CONFIGURATION_ID is unset.",
    );
  }
}

async function main() {
  if (checkOnly) {
    await check();
    return;
  }
  await setup();
}

void main();
