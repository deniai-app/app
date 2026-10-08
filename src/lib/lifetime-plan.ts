import { and, eq, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db/drizzle";
import { billing } from "@/db/schema";
import { findPlanById } from "@/lib/billing";
import { unchangedBillingSnapshot } from "@/lib/billing-snapshot";
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

export function isUnreversedCharge(intent: Stripe.Checkout.Session["payment_intent"]) {
  const charge = intent && typeof intent !== "string" ? intent.latest_charge : null;
  return Boolean(
    charge &&
    typeof charge !== "string" &&
    !charge.refunded &&
    !charge.disputed &&
    !(charge.amount_refunded > 0),
  );
}

/**
 * True when a one-time checkout's payment still stands. A session without a
 * payment intent was fully discounted, so there is no charge to reverse.
 */
export function isPaidCheckoutPaymentCurrent(
  session: Pick<Stripe.Checkout.Session, "payment_intent">,
) {
  return session.payment_intent === null || isUnreversedCharge(session.payment_intent);
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
      !isPaidCheckoutPaymentCurrent(session)
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
    expectedSubscriptionId,
    expectedBillingRecord,
  }: {
    userId: string;
    customerId: string;
    purchase: LifetimePurchase;
    extra?: Partial<typeof billing.$inferInsert>;
    expectedSubscriptionId?: string;
    expectedBillingRecord?: typeof billing.$inferSelect | null;
  },
) {
  return database.transaction(
    async (tx) => {
      await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
      // Recheck inside the same lock used by reversal handling: event delivery
      // order must never resurrect a refunded or disputed one-time purchase.
      const live = await stripe.checkout.sessions.retrieve(
        purchase.checkoutSessionId,
        { expand: ["payment_intent.latest_charge"] },
        { timeout: 10_000, maxNetworkRetries: 0 },
      );
      if (live.payment_status !== "paid" || !isPaidCheckoutPaymentCurrent(live)) return undefined;
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

      if (expectedSubscriptionId || expectedBillingRecord) {
        const [saved] = await tx
          .update(billing)
          .set({ ...updates, updatedAt: new Date() })
          .where(
            and(
              eq(billing.userId, userId),
              isNull(billing.organizationId),
              expectedSubscriptionId
                ? eq(billing.stripeSubscriptionId, expectedSubscriptionId)
                : undefined,
              expectedBillingRecord ? unchangedBillingSnapshot(expectedBillingRecord) : undefined,
            ),
          )
          .returning();
        return saved;
      }

      const [saved] = await tx
        .insert(billing)
        .values({ userId, ...updates })
        .onConflictDoUpdate({
          target: billing.userId,
          targetWhere: sql`organization_id IS NULL`,
          set: { ...updates, updatedAt: new Date() },
          setWhere: expectedBillingRecord === null ? sql`false` : undefined,
        })
        .returning();

      return saved;
    },
    { isolationLevel: "read committed" },
  );
}

/** Revoke only the reversed one-time checkout, preserving any newer contract. */
export async function revokeReversedLifetimeCharge(charge: Stripe.Charge) {
  const paymentIntent =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntent) return;
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntent,
    limit: 100,
  });
  for (const session of sessions.data) {
    const userId = session.metadata?.userId ?? session.client_reference_id;
    if (
      !userId ||
      session.mode !== "payment" ||
      session.metadata?.organizationId ||
      !isLifetimePlanId(session.metadata?.planId)
    )
      continue;
    await db.transaction(
      async (tx) => {
        await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
        await tx
          .update(billing)
          .set({
            planId: null,
            priceId: null,
            mode: "subscription",
            status: "inactive",
            currentPeriodEnd: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(billing.userId, userId),
              isNull(billing.organizationId),
              eq(billing.mode, "payment"),
              eq(billing.checkoutSessionId, session.id),
            ),
          );
      },
      { isolationLevel: "read committed" },
    );
  }
}
