import { env } from "@/env";
import { stripe } from "@/lib/stripe";

/**
 * Open the Stripe Customer Portal for a billing customer.
 *
 * Plan and seat changes must go through the app's own flows (proration,
 * payment behavior, metadata, Max Mode items, team seat sync), so the portal
 * must not offer subscription updates. `STRIPE_PORTAL_CONFIGURATION_ID` pins a
 * configuration created by `tools/stripe-portal-setup.ts`; when it is unset,
 * Stripe's default portal configuration applies (see SETUP.md).
 */
export function createBillingPortalSession(customer: string, returnPath: string) {
  const configuration = env.STRIPE_PORTAL_CONFIGURATION_ID;
  return stripe.billingPortal.sessions.create({
    customer,
    return_url: new URL(returnPath, env.NEXT_PUBLIC_BETTER_AUTH_URL).toString(),
    ...(configuration ? { configuration } : {}),
  });
}
