/**
 * Idempotently create Stripe Billing Meters and metered prices for Max Mode.
 *
 * Usage: pnpm exec tsx --env-file=.env.local ./tools/stripe-max-mode-setup.ts
 */
import Stripe from "stripe";

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

const stripe = new Stripe(secret);

const MAX_MODE_PRICING = {
  unitTokens: 1_000,
  basic: 1,
  premium: 5,
} as const;

type Category = "basic" | "premium";

const CATEGORIES: Array<{
  category: Category;
  eventName: string;
  displayName: string;
  unitAmount: number;
}> = [
  {
    category: "basic",
    eventName: "max_mode_basic",
    displayName: "Max Mode Basic",
    unitAmount: MAX_MODE_PRICING.basic,
  },
  {
    category: "premium",
    eventName: "max_mode_premium",
    displayName: "Max Mode Premium",
    unitAmount: MAX_MODE_PRICING.premium,
  },
];

async function ensureMeter(eventName: string, displayName: string) {
  const existing = await stripe.billing.meters.list({ limit: 100, status: "active" });
  const found = existing.data.find((meter) => meter.event_name === eventName);
  if (found) {
    return found;
  }

  return stripe.billing.meters.create({
    display_name: displayName,
    event_name: eventName,
    default_aggregation: { formula: "sum" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
    value_settings: { event_payload_key: "value" },
  });
}

async function ensurePrice(lookupKey: string, params: Stripe.PriceCreateParams) {
  const listed = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const found = listed.data.at(0);
  if (found) {
    return found;
  }

  return stripe.prices.create({ ...params, lookup_key: lookupKey });
}

async function main() {
  for (const spec of CATEGORIES) {
    const meter = await ensureMeter(spec.eventName, spec.displayName);
    console.log(`meter ${spec.eventName}: ${meter.id}`);

    const lookupKey = `max_mode_${spec.category}_month`;
    const price = await ensurePrice(lookupKey, {
      currency: "usd",
      product_data: {
        name: spec.displayName,
        unit_label: "1K tokens",
      },
      recurring: {
        interval: "month",
        meter: meter.id,
        usage_type: "metered",
      },
      billing_scheme: "per_unit",
      unit_amount: spec.unitAmount,
      transform_quantity: { divide_by: MAX_MODE_PRICING.unitTokens, round: "up" },
    });
    console.log(`price ${lookupKey}: ${price.id}`);
  }

  console.log("Max Mode Stripe meters and prices are ready.");
}

void main();
