import { and, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db/drizzle";
import {
  billing,
  member,
  teamMemberUsagePolicy,
  teamUsagePolicy,
  usageReservation,
} from "@/db/schema";
import { isProOrHigherTier } from "@/lib/billing";
import { isBillingDisabled } from "@/lib/billing-config";
import {
  attachMaxModeMeteredItems,
  getMaxModeBillingCurrency,
  getMaxModePriceAmounts,
  type MaxModeCurrency,
} from "@/lib/max-mode-stripe";
import { canonicalTeamBillingRow } from "@/lib/team-billing-record";
import { isMeteredMaxModePrice } from "@/lib/stripe-subscriptions";
import { deliverMaxModeMeterEvents, enqueueMaxModeMeterEvent } from "@/lib/max-mode-meter-events";

type MaxModeDatabase = Pick<typeof db, "select" | "update">;

// Max Mode pricing in minor currency units per token unit. Chat usage sends
// token counts, so configure the Stripe meter price to bill per 1,000 tokens.
export const MAX_MODE_PRICING = {
  unitTokens: 1_000,
  basic: 1, // $0.01 / ¥1 per 1K basic tokens
  premium: 5, // $0.05 / ¥5 per 1K premium tokens
} as const;

export type MaxModePricing = {
  unitTokens: number;
  basic: number;
  premium: number;
};

// Max Mode is only available for Pro and Max plan users
export function isMaxModeEligible(planId: string | null | undefined): boolean {
  return isProOrHigherTier(planId);
}

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due", "paid"]);

async function canManageTeamMaxMode(userId: string, organizationId: string) {
  const [memberRecord] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);

  return memberRecord?.role === "owner";
}

/**
 * Find the billing record that should be used for Max Mode operations.
 * Uses the team billing record when the user is on an active team plan,
 * otherwise falls back to the personal billing record.
 */
async function getEffectiveBillingRecord(userId: string, database: MaxModeDatabase = db) {
  const selectFields = {
    id: billing.id,
    organizationId: billing.organizationId,
    planId: billing.planId,
    status: billing.status,
    deletionPending: billing.deletionPending,
    stripeCustomerId: billing.stripeCustomerId,
    stripeSubscriptionId: billing.stripeSubscriptionId,
    stripeMeteredBasicItemId: billing.stripeMeteredBasicItemId,
    stripeMeteredPremiumItemId: billing.stripeMeteredPremiumItemId,
    maxModeEnabled: billing.maxModeEnabled,
    maxModeUsageBasic: billing.maxModeUsageBasic,
    maxModeUsagePremium: billing.maxModeUsagePremium,
    maxModePeriodStart: billing.maxModePeriodStart,
  };

  // Check for active team plan first
  const teamRecords = await database
    .select(selectFields)
    .from(billing)
    .innerJoin(member, eq(billing.organizationId, member.organizationId))
    .where(
      and(
        eq(member.userId, userId),
        isNotNull(billing.organizationId),
        canonicalTeamBillingRow(),
        or(like(billing.planId, "pro_team%"), like(billing.planId, "max_team%")),
      ),
    );

  const teamRecord = teamRecords.find(
    (candidate) => candidate.status && ACTIVE_STATUSES.has(candidate.status),
  );

  if (teamRecord) {
    return teamRecord;
  }

  // Fall back to personal billing record
  const [personal] = await database
    .select(selectFields)
    .from(billing)
    .where(and(eq(billing.userId, userId), isNull(billing.organizationId)))
    .limit(1);

  return personal ?? null;
}

export type MaxModeStatus = {
  currency: MaxModeCurrency;
  pricing: MaxModePricing;
  eligible: boolean;
  enabled: boolean;
  memberEnabled: boolean;
  usageBasic: number;
  usagePremium: number;
  periodStart: Date | null;
  estimatedCost: number; // in minor currency units, may include fractions below one unit
};

export async function getMaxModeStatus(userId: string): Promise<MaxModeStatus> {
  const record = await getEffectiveBillingRecord(userId);

  if (!record) {
    return {
      currency: "usd",
      pricing: MAX_MODE_PRICING,
      eligible: false,
      enabled: false,
      memberEnabled: true,
      usageBasic: 0,
      usagePremium: 0,
      periodStart: null,
      estimatedCost: 0,
    };
  }

  const currency = await getMaxModeBillingCurrency(record);
  const stripePriceAmounts = await getMaxModePriceAmounts(currency);
  const pricing = {
    ...MAX_MODE_PRICING,
    basic: stripePriceAmounts.basic ?? MAX_MODE_PRICING.basic,
    premium: stripePriceAmounts.premium ?? MAX_MODE_PRICING.premium,
  };
  const eligible =
    !record.deletionPending && isMaxModeEligible(record.planId) && record.status === "active";
  const [memberPolicy, defaultPolicy] = record.organizationId
    ? await Promise.all([
        db
          .select({ maxModeEnabled: teamMemberUsagePolicy.maxModeEnabled })
          .from(teamMemberUsagePolicy)
          .where(
            and(
              eq(teamMemberUsagePolicy.organizationId, record.organizationId),
              eq(teamMemberUsagePolicy.userId, userId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]),
        db
          .select({ defaultMaxModeEnabled: teamUsagePolicy.defaultMaxModeEnabled })
          .from(teamUsagePolicy)
          .where(eq(teamUsagePolicy.organizationId, record.organizationId))
          .limit(1)
          .then((rows) => rows[0]),
      ])
    : [];
  const memberEnabled =
    memberPolicy?.maxModeEnabled ?? defaultPolicy?.defaultMaxModeEnabled ?? true;
  const teamMaxModeEnabled = !record.organizationId || record.maxModeEnabled;
  const estimatedCost =
    (record.maxModeUsageBasic / pricing.unitTokens) * pricing.basic +
    (record.maxModeUsagePremium / pricing.unitTokens) * pricing.premium;

  return {
    currency,
    pricing,
    eligible: eligible && teamMaxModeEnabled && memberEnabled,
    enabled: eligible && record.maxModeEnabled && memberEnabled,
    memberEnabled,
    usageBasic: record.maxModeUsageBasic,
    usagePremium: record.maxModeUsagePremium,
    periodStart: record.maxModePeriodStart,
    estimatedCost,
  };
}

export async function enableMaxMode(userId: string): Promise<{ success: boolean; error?: string }> {
  const record = await getEffectiveBillingRecord(userId);

  if (!record) {
    return { success: false, error: "No billing record found." };
  }
  if (record.deletionPending) return { success: false, error: "Account deletion is in progress." };

  if (!isMaxModeEligible(record.planId)) {
    return {
      success: false,
      error: "Max Mode is only available for Pro or Max plan users.",
    };
  }

  if (record.status !== "active") {
    return { success: false, error: "You need an active subscription to enable Max Mode." };
  }

  if (record.organizationId && !record.maxModeEnabled) {
    return {
      success: false,
      error: "Team Max Mode is disabled. Ask a team owner to enable it.",
    };
  }

  if (record.organizationId && !(await canManageTeamMaxMode(userId, record.organizationId))) {
    return { success: false, error: "Only organization owners can manage team Max Mode." };
  }

  const attached = await attachMaxModeMeteredItems(record, userId);
  if (!attached.ok) {
    return { success: false, error: attached.error };
  }

  if (record.maxModeEnabled) {
    return { success: true };
  }

  await db
    .update(billing)
    .set({
      maxModeEnabled: true,
      maxModePeriodStart: sql`coalesce(${billing.maxModePeriodStart}, ${new Date().toISOString()}::timestamp)`,
      stripeSubscriptionId: attached.subscriptionId,
      stripeMeteredBasicItemId: attached.basicItemId,
      stripeMeteredPremiumItemId: attached.premiumItemId,
    })
    .where(eq(billing.id, record.id));

  return { success: true };
}

export async function disableMaxMode(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const record = await getEffectiveBillingRecord(userId);

  if (!record) {
    return { success: false, error: "No billing record found." };
  }

  if (!record.maxModeEnabled) {
    return { success: true }; // Already disabled
  }

  if (record.organizationId && !(await canManageTeamMaxMode(userId, record.organizationId))) {
    return { success: false, error: "Only organization owners can manage team Max Mode." };
  }

  await db
    .update(billing)
    .set({
      maxModeEnabled: false,
    })
    .where(eq(billing.id, record.id));

  return { success: true };
}

async function prepareMaxModeMeterEvent(event: Parameters<typeof enqueueMaxModeMeterEvent>[0]) {
  if (!event.stripeCustomerId)
    throw new Error("Max Mode meter event has no original Stripe customer.");
  // Meter hosts are configured when Max Mode is enabled. A retry must never
  // transfer an old charge or create a new subscription for a former member.
  return event.stripeCustomerId;
}

export async function retryMaxModeUsageReports() {
  if (isBillingDisabled) return { delivered: 0, failed: 0, requiresReview: 0 };
  return deliverMaxModeMeterEvents(prepareMaxModeMeterEvent);
}

export async function deliverMaxModeUsageReport(identifier: string) {
  if (isBillingDisabled) return;
  return deliverMaxModeMeterEvents(prepareMaxModeMeterEvent, { id: identifier, limit: 1 });
}

/** Reset the actual meter host's monthly ledger once, including yearly plan hosts. */
export async function syncMaxModeMeterPeriod(subscription: Stripe.Subscription) {
  if (!ACTIVE_STATUSES.has(subscription.status)) return;
  const meters = subscription.items.data.filter((item) => isMeteredMaxModePrice(item.price));
  const starts = meters.map((item) => item.current_period_start).filter((value) => value > 0);
  if (!meters.length || !starts.length) return;
  const periodStart = new Date(Math.min(...starts) * 1000);
  const itemIds = meters.map((item) => item.id);
  await db.transaction(
    async (transaction) => {
      const records = await transaction
        .select({ id: billing.id })
        .from(billing)
        .where(
          and(
            or(
              inArray(billing.stripeMeteredBasicItemId, itemIds),
              inArray(billing.stripeMeteredPremiumItemId, itemIds),
            ),
            or(
              isNull(billing.maxModePeriodStart),
              sql`${billing.maxModePeriodStart} < ${periodStart.toISOString()}::timestamp`,
            ),
          ),
        )
        .for("update");
      for (const record of records) {
        // Read after acquiring the billing lock, so a settlement committed while
        // this webhook waited is included in the new month's ledger.
        const [totals] = await transaction
          .select({
            basic: sql<number>`coalesce(sum(${usageReservation.maxModeAmount}) filter (where ${usageReservation.category} = 'basic'), 0)`,
            premium: sql<number>`coalesce(sum(${usageReservation.maxModeAmount}) filter (where ${usageReservation.category} = 'premium'), 0)`,
          })
          .from(usageReservation)
          .where(
            and(
              eq(usageReservation.billingId, record.id),
              isNotNull(usageReservation.settledAt),
              sql`${usageReservation.createdAt} >= ${periodStart.toISOString()}::timestamptz`,
            ),
          );
        await transaction
          .update(billing)
          .set({
            maxModeUsageBasic: Number(totals?.basic ?? 0),
            maxModeUsagePremium: Number(totals?.premium ?? 0),
            maxModePeriodStart: periodStart,
          })
          .where(eq(billing.id, record.id));
      }
    },
    { isolationLevel: "read committed" },
  );
}
