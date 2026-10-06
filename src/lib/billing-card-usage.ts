import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db/drizzle";
import { billing } from "@/db/schema";
import { stripe } from "@/lib/stripe";

// Same card may be attached across at most this many distinct users (incl. for trials).
export const MAX_USES_PER_CARD = 2;
// Prepaid cards are more abuse-prone (gift cards, virtual numbers).
export const MAX_USES_PER_PREPAID_CARD = 1;

export type CardFunding = "credit" | "debit" | "prepaid" | "unknown";

function normalizeFunding(value: string | null | undefined): CardFunding {
  if (value === "credit" || value === "debit" || value === "prepaid") {
    return value;
  }
  return "unknown";
}

function getCardFundingFromPaymentMethod(
  paymentMethod: string | Stripe.PaymentMethod | null | undefined,
): CardFunding {
  if (!paymentMethod || typeof paymentMethod === "string" || paymentMethod.type !== "card") {
    return "unknown";
  }
  return normalizeFunding(paymentMethod.card?.funding);
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "incomplete",
  "unpaid",
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getCardFingerprintFromPaymentMethod(
  paymentMethod: string | Stripe.PaymentMethod | null | undefined,
) {
  if (!paymentMethod || typeof paymentMethod === "string" || paymentMethod.type !== "card") {
    return null;
  }

  return paymentMethod.card?.fingerprint ?? null;
}

export type CardInfo = {
  fingerprint: string | null;
  funding: CardFunding;
};

function getCardInfoFromPaymentMethod(
  paymentMethod: string | Stripe.PaymentMethod | null | undefined,
): CardInfo {
  return {
    fingerprint: getCardFingerprintFromPaymentMethod(paymentMethod),
    funding: getCardFundingFromPaymentMethod(paymentMethod),
  };
}

function getCardInfoFromSubscription(
  subscription: Stripe.Subscription | null | undefined,
): CardInfo {
  if (!subscription) {
    return { fingerprint: null, funding: "unknown" };
  }

  const fromDefault = getCardInfoFromPaymentMethod(subscription.default_payment_method);
  if (fromDefault.fingerprint) {
    return fromDefault;
  }

  const latestInvoice = subscription.latest_invoice;
  if (!latestInvoice || typeof latestInvoice === "string") {
    return { fingerprint: null, funding: "unknown" };
  }

  const paymentIntent =
    "payment_intent" in latestInvoice ? (latestInvoice.payment_intent ?? null) : null;
  if (!paymentIntent || typeof paymentIntent === "string" || !isObjectRecord(paymentIntent)) {
    return { fingerprint: null, funding: "unknown" };
  }

  const paymentMethod =
    "payment_method" in paymentIntent ? (paymentIntent.payment_method ?? null) : null;
  if (
    paymentMethod != null &&
    typeof paymentMethod !== "string" &&
    !isObjectRecord(paymentMethod)
  ) {
    return { fingerprint: null, funding: "unknown" };
  }

  return getCardInfoFromPaymentMethod(paymentMethod as string | Stripe.PaymentMethod | null);
}

export async function getCustomerPrimaryCardInfo(
  customerId: string,
  subscriptionId?: string | null,
): Promise<CardInfo> {
  try {
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["default_payment_method", "latest_invoice.payment_intent.payment_method"],
      });
      const info = getCardInfoFromSubscription(subscription);
      if (info.fingerprint) {
        return info;
      }
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
      expand: ["data.default_payment_method", "data.latest_invoice.payment_intent.payment_method"],
    });
    const preferredSubscription =
      subscriptions.data.find((subscription) =>
        ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status),
      ) ?? subscriptions.data.at(0);
    const subInfo = getCardInfoFromSubscription(preferredSubscription);
    if (subInfo.fingerprint) {
      return subInfo;
    }

    const paymentMethods = await stripe.customers.listPaymentMethods(customerId, {
      type: "card",
      limit: 1,
    });

    const pm = paymentMethods.data[0];
    if (!pm) {
      return { fingerprint: null, funding: "unknown" };
    }
    return {
      fingerprint: pm.card?.fingerprint ?? null,
      funding: normalizeFunding(pm.card?.funding),
    };
  } catch (error) {
    console.warn("Failed to load customer payment method fingerprint", error);
    return { fingerprint: null, funding: "unknown" };
  }
}

// Back-compat: callers that only need the fingerprint.
export async function getCustomerPrimaryCardFingerprint(
  customerId: string,
  subscriptionId?: string | null,
) {
  const info = await getCustomerPrimaryCardInfo(customerId, subscriptionId);
  return info.fingerprint;
}

// Count distinct users (excluding `excludeUserId`, typically the caller) that
// have this card fingerprint on their billing record. Used for both card-
// registration and trial eligibility under a single rule.
export async function countCardUsesByFingerprint(
  fingerprint: string,
  options: { excludeUserId?: string } = {},
  database: Pick<typeof db, "select"> = db,
) {
  const whereClause = options.excludeUserId
    ? sql`${billing.paymentMethodFingerprint} = ${fingerprint} AND ${billing.userId} <> ${options.excludeUserId}`
    : eq(billing.paymentMethodFingerprint, fingerprint);

  const [result] = await database
    .select({ count: sql<number>`count(distinct ${billing.userId})::int` })
    .from(billing)
    .where(whereClause);

  return result?.count ?? 0;
}

export function getMaxUsesForFunding(funding: CardFunding) {
  return funding === "prepaid" ? MAX_USES_PER_PREPAID_CARD : MAX_USES_PER_CARD;
}

export type CardEligibilityReason = "missing_fingerprint" | "limit_exceeded" | "prepaid_limit";

export type CardEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: CardEligibilityReason; usedCount: number; maxUses: number };

// Single source of truth for "may this card be used (for trial or free-tier
// verification) on this account?" credit/debit: 2 distinct users max, prepaid: 1.
// The current user's own prior use does not count against them.
export async function checkCardEligibility({
  fingerprint,
  funding,
  userId,
  database = db,
}: {
  fingerprint: string | null;
  funding: CardFunding;
  userId: string;
  database?: Pick<typeof db, "select">;
}): Promise<CardEligibilityResult> {
  if (!fingerprint) {
    return { eligible: false, reason: "missing_fingerprint", usedCount: 0, maxUses: 0 };
  }

  const usedByOthers = await countCardUsesByFingerprint(
    fingerprint,
    {
      excludeUserId: userId,
    },
    database,
  );
  const maxUses = getMaxUsesForFunding(funding);
  // The current user counts as 1 use of the slot, so others may take up to maxUses-1.
  if (usedByOthers + 1 > maxUses) {
    return {
      eligible: false,
      reason: funding === "prepaid" ? "prepaid_limit" : "limit_exceeded",
      usedCount: usedByOthers,
      maxUses,
    };
  }
  return { eligible: true };
}

/** Claim a verification slot atomically across different users sharing a card. */
export function claimCardVerification(
  database: typeof db,
  {
    userId,
    customerId,
    fingerprint,
    funding,
  }: { userId: string; customerId: string; fingerprint: string; funding: CardFunding },
) {
  return database.transaction(
    async (transaction) => {
      await transaction.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`card-verification:${fingerprint}`}, 0))`,
      );
      const eligibility = await checkCardEligibility({
        fingerprint,
        funding,
        userId,
        database: transaction,
      });
      if (!eligibility.eligible) return eligibility;
      const verifiedAt = new Date();
      const [record] = await transaction
        .insert(billing)
        .values({
          userId,
          stripeCustomerId: customerId,
          paymentMethodFingerprint: fingerprint,
          cardFunding: funding,
          cardVerifiedAt: verifiedAt,
        })
        .onConflictDoUpdate({
          target: billing.userId,
          targetWhere: sql`organization_id IS NULL`,
          set: {
            paymentMethodFingerprint: fingerprint,
            cardFunding: funding,
            cardVerifiedAt: verifiedAt,
            updatedAt: verifiedAt,
          },
        })
        .returning();
      if (!record) throw new Error("Unable to claim card verification.");
      return { eligible: true as const, record };
    },
    { isolationLevel: "read committed" },
  );
}

export async function isTrialFingerprintEligible(
  fingerprint: string | null,
  context?: {
    customerId?: string;
    userId?: string;
    organizationId?: string | null;
    funding?: CardFunding;
  },
) {
  if (!fingerprint) {
    return false;
  }

  const funding = context?.funding ?? "unknown";
  const userId = context?.userId;
  if (userId) {
    const result = await checkCardEligibility({ fingerprint, funding, userId });
    return result.eligible;
  }
  // Fallback when userId is unavailable: count globally without self-exclusion.
  const count = await countCardUsesByFingerprint(fingerprint);
  return count < getMaxUsesForFunding(funding);
}

export async function getBillingFingerprintUpdates({
  customerId,
  subscriptionId,
  markTrialUsed,
}: {
  customerId: string;
  subscriptionId?: string | null;
  markTrialUsed: boolean;
}) {
  const { fingerprint, funding } = await getCustomerPrimaryCardInfo(customerId, subscriptionId);
  if (markTrialUsed && !fingerprint) {
    console.warn(
      "[billing] getBillingFingerprintUpdates could not mark trial used because getCustomerPrimaryCardInfo returned no fingerprint",
      {
        customerId,
        subscriptionId,
      },
    );
  }

  return {
    // `undefined` leaves the stored value alone: a failed or empty Stripe lookup
    // must not erase the fingerprint that card-reuse and trial checks rely on.
    paymentMethodFingerprint: fingerprint ?? undefined,
    cardFunding: fingerprint ? funding : undefined,
    trialPaymentMethodFingerprint: markTrialUsed && fingerprint ? fingerprint : undefined,
    trialUsedAt: markTrialUsed && fingerprint ? new Date() : undefined,
  };
}
