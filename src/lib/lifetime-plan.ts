import { sql } from "drizzle-orm";
import type Stripe from "stripe";
import type { db } from "@/db/drizzle";
import { billing } from "@/db/schema";
import { findPlanById } from "@/lib/billing";
import { stripe } from "@/lib/stripe";

/** Statuses under which a subscription (still) grants its plan. */
const SUBSCRIPTION_ACCESS_STATUSES = new Set(["active", "trialing", "past_due", "canceled"]);

export function isLifetimePlanId(planId: string | null | undefined): planId is string {
  return Boolean(planId?.endsWith("_lifetime") && findPlanById(planId));
}

/** True for a personal billing row that holds a paid one-time plan. */
export function isPaidLifetimeRecord(
  record: { planId: string | null; status: string | null; mode: string | null } | undefined,
) {
  return Boolean(
    record &&
    isLifetimePlanId(record.planId) &&
    record.status === "paid" &&
    record.mode === "payment",
  );
}

/** `canceled` means "cancels at period end"; fully ended subscriptions are `inactive`. */
export function grantsSubscriptionAccess(status: string | null | undefined) {
  return SUBSCRIPTION_ACCESS_STATUSES.has(status ?? "");
}

/**
 * The status stored for a Stripe subscription. A fully ended subscription keeps
 * its last period end, so storing `canceled` for it would read as a paid grace
 * period: it becomes `inactive`, and `canceled` is kept for "cancels at period end".
 */
export function resolveSubscriptionStatus(
  subscription: Pick<Stripe.Subscription, "status" | "cancel_at_period_end" | "cancel_at">,
) {
  if (subscription.status === "canceled") return "inactive";
  return subscription.cancel_at_period_end === true || subscription.cancel_at
    ? "canceled"
    : subscription.status;
}

export type LifetimePurchase = {
  planId: string;
  priceId: string | null;
  checkoutSessionId: string;
};

function isUnreversedCharge(intent: Stripe.Checkout.Session["payment_intent"]) {
  const charge = intent && typeof intent !== "string" ? intent.latest_charge : null;
  return Boolean(charge && typeof charge !== "string" && !charge.refunded && !charge.disputed);
}

/**
 * The billing row holds a single plan, so a subscription bought on top of a
 * lifetime plan replaces it. Recover the paid, unreversed one-time purchase from
 * Stripe once that subscription no longer grants access.
 */
export async function findPaidLifetimePurchase(
  customerId: string,
): Promise<LifetimePurchase | null> {
  const sessions = await stripe.checkout.sessions.list({
    customer: customerId,
    status: "complete",
    limit: 100,
    expand: ["data.payment_intent.latest_charge"],
  });

  for (const session of sessions.data) {
    const planId = session.metadata?.planId;
    if (
      session.mode !== "payment" ||
      session.payment_status !== "paid" ||
      !isLifetimePlanId(planId) ||
      !isUnreversedCharge(session.payment_intent)
    ) {
      continue;
    }

    const intent = session.payment_intent;
    return {
      planId,
      priceId: intent && typeof intent !== "string" ? (intent.metadata?.priceId ?? null) : null,
      checkoutSessionId: session.id,
    };
  }

  return null;
}

export async function saveLifetimePlan(
  database: typeof db,
  {
    userId,
    customerId,
    purchase,
    extra,
  }: {
    userId: string;
    customerId: string;
    purchase: LifetimePurchase;
    extra?: Partial<typeof billing.$inferInsert>;
  },
) {
  const updates = {
    ...extra,
    stripeCustomerId: customerId,
    stripeSubscriptionId: null,
    planId: purchase.planId,
    priceId: purchase.priceId,
    status: "paid",
    mode: "payment",
    currentPeriodEnd: null,
    cancelAt: null,
    checkoutSessionId: purchase.checkoutSessionId,
  };

  const [saved] = await database
    .insert(billing)
    .values({ userId, ...updates })
    .onConflictDoUpdate({
      target: billing.userId,
      targetWhere: sql`organization_id IS NULL`,
      set: { ...updates, updatedAt: new Date() },
    })
    .returning();

  return saved;
}
