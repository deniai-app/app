import { and, eq, isNotNull, isNull, like, or, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { billing, member, teamMemberUsagePolicy, teamUsagePolicy } from "@/db/schema";
import { isProOrHigherTier } from "@/lib/billing";
import { isBillingDisabled } from "@/lib/billing-config";
import {
  attachMaxModeMeteredItems,
  getMaxModeBillingCurrency,
  getMaxModePriceAmounts,
  type MaxModeCurrency,
} from "@/lib/max-mode-stripe";
import { stripe } from "@/lib/stripe";
import { canonicalTeamBillingRow } from "@/lib/team-billing-record";

import type { UsageCategory } from "./usage";
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
  const eligible = isMaxModeEligible(record.planId) && record.status === "active";
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
      maxModePeriodStart: new Date(),
      maxModeUsageBasic: 0,
      maxModeUsagePremium: 0,
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

async function applyMaxModeUsageDelta(
  userId: string,
  category: UsageCategory,
  expression: (
    column: typeof billing.maxModeUsageBasic | typeof billing.maxModeUsagePremium,
  ) => ReturnType<typeof sql>,
  database: MaxModeDatabase,
): Promise<{ success: boolean; newUsage: number }> {
  const record = await getEffectiveBillingRecord(userId, database);

  if (!record) {
    return { success: false, newUsage: 0 };
  }

  const column = category === "basic" ? billing.maxModeUsageBasic : billing.maxModeUsagePremium;
  const field = category === "basic" ? "maxModeUsageBasic" : "maxModeUsagePremium";

  const [updated] = await database
    .update(billing)
    .set({
      [field]: expression(column),
    })
    .where(eq(billing.id, record.id))
    .returning({
      maxModeUsageBasic: billing.maxModeUsageBasic,
      maxModeUsagePremium: billing.maxModeUsagePremium,
    });

  if (!updated) {
    // The billing row can disappear between the lookup and the update.
    return { success: false, newUsage: 0 };
  }

  return {
    success: true,
    newUsage: category === "basic" ? updated.maxModeUsageBasic : updated.maxModeUsagePremium,
  };
}

/**
 * Records Max Mode overage in the local ledger only.
 *
 * Deliberately does *not* report to Stripe: callers reserve an estimate up front
 * and reconcile down to actual usage afterwards, and a meter event cannot be
 * partially reduced (Stripe only cancels a whole event by identifier, within 24h).
 * Reporting here would bill the estimate permanently. Use
 * {@link reportMaxModeUsageToStripe} once, after reconciliation.
 */
export async function recordMaxModeUsage(
  userId: string,
  category: UsageCategory,
  amount = 1,
  database: MaxModeDatabase = db,
) {
  if (amount <= 0) {
    return { success: false, newUsage: 0 };
  }
  return applyMaxModeUsageDelta(userId, category, (column) => sql`${column} + ${amount}`, database);
}

/** Reverses a local Max Mode ledger entry, e.g. when an over-reserved estimate is refunded. */
export async function refundMaxModeUsage(
  userId: string,
  category: UsageCategory,
  amount = 1,
  database: MaxModeDatabase = db,
) {
  if (amount <= 0) {
    return { success: false, newUsage: 0 };
  }
  return applyMaxModeUsageDelta(
    userId,
    category,
    (column) => sql`GREATEST(${column} - ${amount}, 0)`,
    database,
  );
}

/**
 * Reports metered Max Mode overage to Stripe. Call once per request with the
 * final reconciled amount — meter events are append-only.
 */
export async function reportMaxModeUsageToStripe(
  userId: string,
  category: UsageCategory,
  amount: number,
) {
  if (amount <= 0 || isBillingDisabled) {
    return;
  }

  const record = await getEffectiveBillingRecord(userId);

  if (!record?.stripeCustomerId) {
    // Local ledger already has the overage; without a customer we cannot bill it.
    console.error("Max Mode usage not reported to Stripe: no customer", {
      userId,
      category,
      amount,
    });
    return;
  }

  if (!record.stripeMeteredBasicItemId || !record.stripeMeteredPremiumItemId) {
    const attached = await attachMaxModeMeteredItems(record, userId);
    if (!attached.ok) {
      console.error("Max Mode usage not billed: metered prices missing", attached.error, {
        userId,
        category,
        amount,
      });
    }
  }

  try {
    await stripe.billing.meterEvents.create({
      event_name: `max_mode_${category}`,
      payload: {
        stripe_customer_id: record.stripeCustomerId,
        value: String(amount),
      },
    });
  } catch (error) {
    // Log but don't fail - we've already recorded locally
    console.error("Failed to report usage to Stripe:", error);
  }
}

export async function resetMaxModeUsage(userId: string): Promise<void> {
  const record = await getEffectiveBillingRecord(userId);
  if (!record) return;

  await db
    .update(billing)
    .set({
      maxModeUsageBasic: 0,
      maxModeUsagePremium: 0,
      maxModePeriodStart: new Date(),
    })
    .where(eq(billing.id, record.id));
}
