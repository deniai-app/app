import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db/drizzle";
import { adCampaign } from "@/db/schema";
import { stripe } from "@/lib/stripe";

const FIXED_REFUND_PENDING = "Fixed slot unavailable; refund pending";
const FIXED_REFUND_COMPLETE = "Fixed slot unavailable; payment refunded";

export async function activatePaidAd(session: Stripe.Checkout.Session) {
  const id = session.metadata?.adCampaignId;
  if (!id || session.payment_status !== "paid" || session.mode !== "payment") return;
  const refundIntent = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('deni-fixed-ads'))`);
    const [ad] = await tx.select().from(adCampaign).where(eq(adCampaign.id, id)).limit(1);
    if (
      !ad ||
      ad.stripeSessionId !== session.id ||
      (ad.status !== "approved" &&
        !(ad.status === "rejected" && ad.reviewReason === FIXED_REFUND_PENDING)) ||
      ad.userId !== session.metadata?.userId ||
      // A promotion code may lower the payment, but not the funded campaign budget.
      session.amount_subtotal !== ad.budgetYen ||
      session.amount_total === null ||
      session.amount_total < 0 ||
      session.amount_total > ad.budgetYen ||
      session.currency !== "jpy"
    )
      return;
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    // A previous webhook may have reserved a refund and failed during Stripe I/O.
    // Retry that refund even if the fixed slot has since become free.
    if (ad.status === "rejected") return paymentIntentId;
    if (ad.plan === "fixed") {
      const [occupied] = await tx
        .select({ id: adCampaign.id })
        .from(adCampaign)
        .where(
          and(
            ne(adCampaign.id, ad.id),
            eq(adCampaign.plan, "fixed"),
            eq(adCampaign.status, "active"),
            gt(adCampaign.endsAt, new Date()),
          ),
        )
        .limit(1);
      if (occupied) {
        // Reject under the lock before refunding, so another activation can
        // never make this paid campaign active while its refund is in flight.
        await tx
          .update(adCampaign)
          .set({
            status: "rejected",
            reviewReason: paymentIntentId ? FIXED_REFUND_PENDING : "Fixed slot unavailable",
            updatedAt: new Date(),
          })
          .where(eq(adCampaign.id, ad.id));
        return paymentIntentId;
      }
    }
    await tx
      .update(adCampaign)
      .set({
        status: "active",
        startsAt: new Date(),
        endsAt: ad.plan === "fixed" ? new Date(Date.now() + 30 * 86_400_000) : null,
        spentYen: ad.plan === "fixed" ? 3000 : 0,
        updatedAt: new Date(),
      })
      .where(eq(adCampaign.id, ad.id));
  });
  if (!refundIntent) return;
  // The refund key makes concurrent/replayed webhooks safe, including a crash
  // after Stripe succeeds but before the final database update.
  await stripe.refunds.create(
    { payment_intent: refundIntent },
    { idempotencyKey: `ad-fixed-conflict-${session.id}` },
  );
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('deni-fixed-ads'))`);
    await tx
      .update(adCampaign)
      .set({ reviewReason: FIXED_REFUND_COMPLETE, updatedAt: new Date() })
      .where(
        and(
          eq(adCampaign.id, id),
          eq(adCampaign.stripeSessionId, session.id),
          eq(adCampaign.status, "rejected"),
          eq(adCampaign.reviewReason, FIXED_REFUND_PENDING),
        ),
      );
  });
}

export async function pauseReversedAdCharge(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (!intent.metadata.adCampaignId) return;
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  const checkoutId = sessions.data[0]?.id;
  if (!checkoutId) return;
  // Share activation's lock and persist the reversal even before activation.
  // A delayed paid checkout event must never revive a refunded campaign.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('deni-fixed-ads'))`);
    await tx
      .update(adCampaign)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(
          eq(adCampaign.id, intent.metadata.adCampaignId),
          eq(adCampaign.stripeSessionId, checkoutId),
          inArray(adCampaign.status, ["approved", "active"]),
        ),
      );
  });
}

export async function releaseExpiredAdCheckout(session: Stripe.Checkout.Session) {
  if (!session.metadata?.adCampaignId) return;
  await db
    .update(adCampaign)
    .set({ stripeSessionId: null, checkoutExpiresAt: null })
    .where(
      and(
        eq(adCampaign.id, session.metadata.adCampaignId),
        eq(adCampaign.stripeSessionId, session.id),
        eq(adCampaign.status, "approved"),
      ),
    );
}
