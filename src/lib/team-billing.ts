import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { billing, member, teamUsageAuditLog } from "@/db/schema";
import { isBillingDisabled } from "@/lib/billing-config";
import { isTeamPlan } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { getLicensedSubscriptionItem } from "@/lib/stripe-subscriptions";
import { findTeamBillingRecord, withTeamBillingLock } from "@/lib/team-billing-record";

const ACTIVE_SUB_STATUSES = new Set(["trialing", "active", "past_due"]);

export async function getTeamBilling(organizationId: string) {
  return (await findTeamBillingRecord(db, organizationId)) ?? null;
}

export async function getOrgMemberCount(
  organizationId: string,
  database: Pick<typeof db, "select"> = db,
): Promise<number> {
  const [result] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  return result?.count ?? 1;
}

export async function updateTeamSeatCount(organizationId: string) {
  if (isBillingDisabled) return;

  try {
    await withTeamBillingLock(db, organizationId, async (transaction) => {
      const teamBilling = await findTeamBillingRecord(transaction, organizationId);
      if (!teamBilling?.stripeSubscriptionId) return;
      // Keep the lock through Stripe's write: otherwise a delayed older count
      // can overwrite the quantity sent by a newer membership change.
      const memberCount = await getOrgMemberCount(organizationId, transaction);
      const subscription = await stripe.subscriptions.retrieve(teamBilling.stripeSubscriptionId, {
        expand: ["items"],
      });
      const item = getLicensedSubscriptionItem(subscription) ?? subscription.items.data[0];
      if (!item || item.quantity === memberCount) return;

      await stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, quantity: memberCount }],
        proration_behavior: "always_invoice",
      });
    });
  } catch (error) {
    console.error("[team-billing] Failed to update seat count:", error);
  }
}

/**
 * Cancel a user's personal Stripe subscription (if active) immediately with proration.
 * Called when the user joins an org with an active team plan so they don't get double-billed.
 */
export async function cancelPersonalSubscription(userId: string, organizationId: string) {
  if (isBillingDisabled) return;

  // Joining a free/unpaid organization must never cancel a personal plan.
  const teamBilling = await getTeamBilling(organizationId);
  if (!teamBilling?.stripeSubscriptionId || !isTeamPlan(teamBilling.planId)) return;
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  if (!membership) return;

  const [record] = await db
    .select()
    .from(billing)
    .where(and(eq(billing.userId, userId), isNull(billing.organizationId)))
    .limit(1);

  if (!record?.stripeSubscriptionId) return;

  try {
    // Verify live Stripe state, not only a potentially stale local billing row.
    const teamSubscription = await stripe.subscriptions.retrieve(teamBilling.stripeSubscriptionId);
    if (
      !ACTIVE_SUB_STATUSES.has(teamSubscription.status) ||
      !getLicensedSubscriptionItem(teamSubscription)
    )
      return;

    const subscription = await stripe.subscriptions.retrieve(record.stripeSubscriptionId);
    if (!ACTIVE_SUB_STATUSES.has(subscription.status)) return;

    await stripe.subscriptions.cancel(record.stripeSubscriptionId, {
      prorate: true,
    });

    await db
      .update(billing)
      .set({
        status: "canceled",
        currentPeriodEnd: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billing.userId, userId),
          isNull(billing.organizationId),
          eq(billing.stripeSubscriptionId, record.stripeSubscriptionId),
        ),
      );

    console.log("[team-billing] Canceled personal subscription for user joining team", { userId });
  } catch (error) {
    console.error("[team-billing] Failed to cancel personal subscription:", error);
  }
}

/**
 * Cancel personal subscriptions for all members of an organization.
 * Called when a team plan is first activated so no member pays for both.
 */
export async function cancelOrgMembersPersonalSubscriptions(organizationId: string) {
  const members = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, organizationId));

  await Promise.allSettled(
    members.map((m) => cancelPersonalSubscription(m.userId, organizationId)),
  );
}

/**
 * Cancel an organization's team Stripe subscription immediately (with proration) and
 * remove its billing row. `billing.organizationId` has no DB-level foreign key/cascade,
 * so without this an org deletion would leave an orphaned row and a subscription that
 * keeps billing with no team left to manage or cancel it from. Called from
 * `beforeDeleteOrganization` so a failure here blocks the deletion instead of silently
 * losing track of an active subscription.
 */
export async function cancelTeamSubscriptionForDeletion(organizationId: string) {
  if (isBillingDisabled) return;

  const records = await db.select().from(billing).where(eq(billing.organizationId, organizationId));
  const subscriptionIds = new Set(
    records.flatMap((record) => (record.stripeSubscriptionId ? [record.stripeSubscriptionId] : [])),
  );
  for (const subscriptionId of subscriptionIds) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (ACTIVE_SUB_STATUSES.has(subscription.status)) {
      await stripe.subscriptions.cancel(subscriptionId, { prorate: true });
    }
  }
  await db.delete(billing).where(eq(billing.organizationId, organizationId));
}

/**
 * Write a team audit log entry from a context that has no tRPC `ProtectedContext`
 * (the Stripe webhook, better-auth organization hooks). The tRPC router keeps its
 * own `recordTeamUsageAuditLog` for use inside procedures since it already has
 * `ctx.db` handy, but both write to the same table with the same shape.
 */
export async function recordTeamAuditEvent({
  organizationId,
  actorUserId,
  targetUserId,
  action,
  metadata,
}: {
  organizationId: string;
  actorUserId: string;
  targetUserId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(teamUsageAuditLog).values({
    organizationId,
    actorUserId,
    targetUserId: targetUserId ?? null,
    action,
    metadata: metadata ?? {},
  });
}
