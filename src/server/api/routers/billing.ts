import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { billing, member, user } from "@/db/schema";
import { env } from "@/env";
import {
  type BillingPlan,
  billingPlans,
  findPlanById,
  findPlanByLookupKey,
  isTeamPlan,
} from "@/lib/billing";
import {
  type CardFunding,
  claimCardVerification,
  getBillingFingerprintUpdates,
} from "@/lib/billing-card-usage";
import { isBillingDisabled } from "@/lib/billing-config";
import { unchangedBillingSnapshot } from "@/lib/billing-snapshot";
import { getAccountDeletionStatus } from "@/lib/account-deletion-billing";
import {
  createFlashOfferEndAt,
  getFlashOfferCouponId,
  isFlashOfferActive,
  isFlashOfferPlan,
} from "@/lib/billing-offers";
import {
  findPaidLifetimePurchase,
  grantsSubscriptionAccess,
  resolveSubscriptionStatus,
  isPaidCheckoutPaymentCurrent,
  isLifetimePlanId,
  isPaidLifetimeRecord,
  saveLifetimePlan,
} from "@/lib/lifetime-plan";
import { disableMaxMode, enableMaxMode, getMaxModeStatus } from "@/lib/max-mode";
import { attachMaxModeMeteredItems } from "@/lib/max-mode-stripe";
import { escapeStripeSearchValue } from "@/lib/stripe-search";
import { stripe } from "@/lib/stripe";
import { createBillingPortalSession } from "@/lib/stripe-portal";
import {
  checkoutCardPaymentMethodOptions,
  customCheckoutRequestOptions,
  requestThreeDSecure,
} from "@/lib/stripe-checkout";
import { checkoutSessionExpand, summarizeCheckoutSession } from "@/lib/stripe-checkout-receipt";
import {
  listCustomerSubscriptions,
  getLicensedPrice,
  getLicensedSubscriptionItem,
  getSubscriptionPeriodEndDate,
  isMaxModeOnlySubscription,
  isMeteredMaxModePrice,
  pickLicensedSubscription,
} from "@/lib/stripe-subscriptions";
import { getUsageSummary } from "@/lib/usage";
import { type ProtectedContext, protectedProcedure, router } from "../trpc";

const planIdSchema = z.enum([
  "plus_monthly",
  "plus_yearly",
  "pro_monthly",
  "pro_yearly",
  "max_monthly",
  "max_yearly",
  "pro_lifetime",
]);

type BillingRecord = typeof billing.$inferSelect;
const ACTIVE_SUB_STATUSES = new Set(["trialing", "active", "past_due"]);
const billingEnabledProcedure = protectedProcedure.use(({ ctx, next }) => {
  // Anonymous guest sessions have placeholder email addresses and must not
  // create Stripe customers. Sign in to a permanent account before billing.
  if (ctx.session?.user?.isAnonymous) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sign in before using billing." });
  }
  if (isBillingDisabled) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Billing is disabled.",
    });
  }
  return next();
});

function deriveModeFromPrice(price: Stripe.Price | null | undefined): "subscription" | "payment" {
  if (!price) {
    return "subscription";
  }
  return price.recurring ? "subscription" : "payment";
}

async function getPriceForPlan(plan: BillingPlan) {
  const prices = await stripe.prices.list({
    lookup_keys: [plan.lookupKey],
    active: true,
    limit: 1,
  });

  const price = prices.data.at(0);
  if (!price) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unable to load ${plan.lookupKey} price. Configure lookup_key=${plan.lookupKey} in Stripe.`,
    });
  }

  return price;
}

/** Stripe accepts at most 10 lookup keys per `prices.list` call. */
const STRIPE_LOOKUP_KEY_BATCH_SIZE = 10;

/** Loads prices for several plans with one Stripe request per 10 lookup keys. */
async function getPricesForPlans(plans: BillingPlan[]) {
  const pricesByLookupKey = new Map<string, Stripe.Price>();
  const lookupKeys = [...new Set(plans.map((plan) => plan.lookupKey))];

  const batches: string[][] = [];
  for (let index = 0; index < lookupKeys.length; index += STRIPE_LOOKUP_KEY_BATCH_SIZE) {
    batches.push(lookupKeys.slice(index, index + STRIPE_LOOKUP_KEY_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      stripe.prices.list({ lookup_keys: batch, active: true, limit: batch.length }),
    ),
  );
  for (const price of results.flatMap((result) => result.data)) {
    if (price.lookup_key && !pricesByLookupKey.has(price.lookup_key)) {
      pricesByLookupKey.set(price.lookup_key, price);
    }
  }

  return plans.map((plan) => {
    const price = pricesByLookupKey.get(plan.lookupKey);
    if (!price) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unable to load ${plan.lookupKey} price. Configure lookup_key=${plan.lookupKey} in Stripe.`,
      });
    }
    return price;
  });
}

function getPlanFromPrice(price: Stripe.Price | null | undefined) {
  return findPlanByLookupKey(price?.lookup_key ?? undefined);
}

async function getFlashOfferCoupon() {
  const couponId = getFlashOfferCouponId();
  if (!couponId) {
    return null;
  }

  try {
    return await stripe.coupons.retrieve(couponId);
  } catch (error) {
    console.warn("Failed to load flash offer coupon", error);
    return null;
  }
}

function applyCouponToAmount(
  amount: number | null | undefined,
  coupon: Stripe.Coupon | null | undefined,
  currency: string | null | undefined,
) {
  if (amount == null || !coupon || !coupon.valid) {
    return amount ?? null;
  }

  if (coupon.currency && currency && coupon.currency.toLowerCase() !== currency.toLowerCase()) {
    return amount;
  }

  if (coupon.percent_off != null) {
    return Math.max(0, Math.round(amount * (1 - coupon.percent_off / 100)));
  }

  if (coupon.amount_off != null) {
    return Math.max(0, amount - coupon.amount_off);
  }

  return amount;
}

async function fetchUserProfile(ctx: ProtectedContext, userId: string) {
  const [profile] = await ctx.db
    .select({
      email: user.email,
      name: user.name,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!profile?.email) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "User profile missing an email address.",
    });
  }

  return profile;
}

async function findOrCreateStripeCustomer({
  email,
  name,
  userId,
}: {
  email: string;
  name?: string | null;
  userId: string;
}) {
  // Email is not an account identifier: different accounts may share or change it.
  // Fail closed on search errors rather than creating a duplicate customer.
  const query = `metadata['userId']:'${escapeStripeSearchValue(userId)}'`;
  let page: string | undefined;
  do {
    const search = await stripe.customers.search({ query, limit: 100, page });
    const personalCustomer = search.data.find((candidate) => !candidate.metadata.organizationId);
    if (personalCustomer) return personalCustomer;
    page = search.next_page ?? undefined;
  } while (page);

  return stripe.customers.create(
    { email, name: name ?? undefined, metadata: { userId } },
    { idempotencyKey: `billing-personal-${userId}` },
  );
}

async function ensureBillingRecord(ctx: ProtectedContext, userId: string) {
  const [initial] = await ctx.db
    .select()
    .from(billing)
    .where(and(eq(billing.userId, userId), isNull(billing.organizationId)))
    .limit(1);
  if (initial?.deletionPending)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Account deletion is in progress.",
    });
  if (initial && (initial.firstPaidAt || initial.flashOfferEndsAt)) return initial;

  // Release pooled reads before Stripe I/O. The account idempotency key keeps
  // concurrent creators on one customer; the transaction below rechecks the row.
  const profile = initial ? null : await fetchUserProfile(ctx, userId);
  const customer = profile
    ? await findOrCreateStripeCustomer({ email: profile.email, name: profile.name, userId })
    : null;
  return ctx.db.transaction(async (tx) => {
    // Serialize creation for this account across concurrent checkout and card requests.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"personal:" + userId}, 0))`,
    );
    const existing = await tx
      .select()
      .from(billing)
      .where(and(eq(billing.userId, userId), isNull(billing.organizationId)))
      .limit(1);

    if (existing[0]) {
      const record = existing[0];
      if (!record.firstPaidAt && !record.flashOfferEndsAt) {
        const [updated] = await tx
          .update(billing)
          .set({
            flashOfferEndsAt: createFlashOfferEndAt(),
            updatedAt: new Date(),
          })
          .where(and(eq(billing.userId, userId), isNull(billing.organizationId)))
          .returning();

        return updated ?? record;
      }

      return record;
    }

    if (!customer) throw new Error("Personal billing record disappeared during creation");

    const [created] = await tx
      .insert(billing)
      .values({
        userId,
        stripeCustomerId: customer.id,
        status: "inactive",
        flashOfferEndsAt: createFlashOfferEndAt(),
      })
      .onConflictDoNothing()
      .returning();

    if (created) return created;
    const [record] = await tx
      .select()
      .from(billing)
      .where(and(eq(billing.userId, userId), isNull(billing.organizationId)))
      .limit(1);
    if (!record) throw new Error("Unable to create personal billing record");
    return record;
  });
}

async function syncSubscription(ctx: ProtectedContext, userId: string) {
  const billingRecord = await ensureBillingRecord(ctx, userId);

  const subscriptions = await listCustomerSubscriptions(billingRecord.stripeCustomerId, [
    "data.default_payment_method",
  ]);

  const bestSub = pickLicensedSubscription(subscriptions, (status) =>
    ACTIVE_SUB_STATUSES.has(status),
  );

  if (!bestSub || !ACTIVE_SUB_STATUSES.has(bestSub.status)) {
    // An ended subscription must never overwrite a paid one-time plan.
    if (isPaidLifetimeRecord(billingRecord)) {
      return billingRecord;
    }
    // A lifetime plan bought before a now-ended subscription takes over again.
    if (billingRecord.firstPaidAt) {
      const lifetime = await findPaidLifetimePurchase(billingRecord.stripeCustomerId);
      if (lifetime) {
        const restored = await saveLifetimePlan(ctx.db, {
          userId,
          customerId: billingRecord.stripeCustomerId,
          purchase: lifetime,
          expectedBillingRecord: billingRecord,
        });
        return restored ?? (await ensureBillingRecord(ctx, userId));
      }
    }
  }

  if (!bestSub) {
    // No subscription exists in Stripe, so a row that still claims one is stale.
    if (billingRecord.stripeSubscriptionId && billingRecord.mode === "subscription") {
      const [cleared] = await ctx.db
        .update(billing)
        .set({
          stripeSubscriptionId: null,
          status: "inactive",
          cancelAt: null,
          currentPeriodEnd: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billing.userId, userId),
            isNull(billing.organizationId),
            unchangedBillingSnapshot(billingRecord),
          ),
        )
        .returning();
      return cleared ?? (await ensureBillingRecord(ctx, userId));
    }
    return billingRecord;
  }

  const subscription = await stripe.subscriptions.retrieve(bestSub.id);
  const updates: Partial<BillingRecord> = {};

  if (subscription) {
    const price = getLicensedPrice(subscription) ?? subscription.items.data.at(0)?.price ?? null;
    // The billed price is authoritative; metadata is not updated by portal plan changes.
    const plan = getPlanFromPrice(price) ?? findPlanById(subscription.metadata?.planId ?? "");
    updates.stripeSubscriptionId = subscription.id;
    updates.priceId = price?.id;
    updates.planId = plan?.id ?? billingRecord.planId;
    updates.cancelAt = subscription.cancel_at;
    // An ended subscription keeps its last period end, so "canceled" would read
    // as a grace period. Match the webhook: ended subscriptions are inactive.
    updates.status = resolveSubscriptionStatus(subscription);
    updates.mode = deriveModeFromPrice(price);
    updates.currentPeriodEnd = getSubscriptionPeriodEndDate(subscription);
  }
  if (Object.keys(updates).length === 0) {
    return billingRecord;
  }

  const [updated] = await ctx.db
    .insert(billing)
    .values({
      userId,
      stripeCustomerId: billingRecord.stripeCustomerId,
      ...updates,
    })
    .onConflictDoUpdate({
      target: billing.userId,
      targetWhere: sql`organization_id IS NULL`,
      set: {
        stripeCustomerId: billingRecord.stripeCustomerId,
        ...updates,
        updatedAt: new Date(),
      },
      setWhere: unchangedBillingSnapshot(billingRecord),
    })
    .returning();

  return updated ?? (await ensureBillingRecord(ctx, userId));
}

async function reuseOpenCheckoutSession({
  checkoutSessionId,
  userId,
  planId,
}: {
  checkoutSessionId: string | null | undefined;
  userId: string;
  planId: string;
}) {
  if (!checkoutSessionId) {
    return null;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(
      checkoutSessionId,
      {},
      customCheckoutRequestOptions,
    );

    if (
      session.status !== "open" ||
      session.ui_mode !== "elements" ||
      session.client_reference_id !== userId ||
      session.metadata?.planId !== planId ||
      !session.client_secret
    ) {
      return null;
    }

    return session;
  } catch (error) {
    console.warn("Failed to reuse checkout session", error);
    return null;
  }
}

export const billingRouter = router({
  accountDeletionStatus: protectedProcedure.query(({ ctx }) =>
    getAccountDeletionStatus(ctx.userId),
  ),
  plans: billingEnabledProcedure.query(async ({ ctx }) => {
    const individualPlans = billingPlans.filter((p) => !isTeamPlan(p.id));
    const billingRecord = await ensureBillingRecord(ctx, ctx.userId);
    const flashOfferActive = isFlashOfferActive(billingRecord.flashOfferEndsAt);
    const flashOfferEndsAt = flashOfferActive
      ? (billingRecord.flashOfferEndsAt?.toISOString() ?? null)
      : null;
    const flashOfferCoupon = flashOfferEndsAt ? await getFlashOfferCoupon() : null;
    const prices = await getPricesForPlans(individualPlans);
    const plans = individualPlans.map((plan, index) => {
      const price = prices[index];
      const mode = deriveModeFromPrice(price);
      const discountedAmount =
        flashOfferEndsAt && isFlashOfferPlan(plan.id)
          ? applyCouponToAmount(price.unit_amount, flashOfferCoupon, price.currency)
          : price.unit_amount;
      return {
        id: plan.id,
        lookupKey: plan.lookupKey,
        mode,
        priceId: price.id,
        amount: discountedAmount,
        originalAmount: discountedAmount !== price.unit_amount ? price.unit_amount : null,
        currency: price.currency,
        interval: price.recurring?.interval ?? null,
        intervalCount: price.recurring?.interval_count ?? 1,
        isTeamPlan: false,
        // Only advertise the offer when the coupon actually lowers this price.
        limitedTimeOfferEndsAt: discountedAmount !== price.unit_amount ? flashOfferEndsAt : null,
      };
    });

    return { plans };
  }),
  /**
   * App-wide flash offer promo for card-verified users who have never paid.
   * Read-only: unlike `plans`, it never creates a billing record or starts the timer.
   */
  flashOffer: protectedProcedure.query(async ({ ctx }) => {
    if (isBillingDisabled || ctx.session?.user?.isAnonymous) return null;

    const [record] = await ctx.db
      .select({
        cardVerifiedAt: billing.cardVerifiedAt,
        firstPaidAt: billing.firstPaidAt,
        flashOfferEndsAt: billing.flashOfferEndsAt,
        status: billing.status,
      })
      .from(billing)
      .where(and(eq(billing.userId, ctx.userId), isNull(billing.organizationId)))
      .limit(1);
    if (
      !record?.cardVerifiedAt ||
      record.firstPaidAt ||
      ACTIVE_SUB_STATUSES.has(record.status ?? "") ||
      !isFlashOfferActive(record.flashOfferEndsAt)
    ) {
      return null;
    }

    const [teamRecord] = await ctx.db
      .select({ id: billing.id })
      .from(billing)
      .innerJoin(member, eq(billing.organizationId, member.organizationId))
      .where(
        and(
          eq(member.userId, ctx.userId),
          isNotNull(billing.organizationId),
          inArray(billing.status, [...ACTIVE_SUB_STATUSES]),
        ),
      )
      .limit(1);
    if (teamRecord) return null;

    const coupon = await getFlashOfferCoupon();
    if (!coupon?.valid) return null;
    const offerPlans = billingPlans.filter((p) => !isTeamPlan(p.id) && isFlashOfferPlan(p.id));
    const prices = await getPricesForPlans(offerPlans);
    const percents = prices
      .map((price) => {
        const amount = applyCouponToAmount(price.unit_amount, coupon, price.currency);
        return amount != null && price.unit_amount
          ? Math.round((1 - amount / price.unit_amount) * 100)
          : 0;
      })
      .filter((percent) => percent > 0);
    if (percents.length === 0 || !record.flashOfferEndsAt) return null;

    const percentOff = Math.max(...percents);
    return {
      endsAt: record.flashOfferEndsAt.toISOString(),
      percentOff,
      isUpTo: Math.min(...percents) !== percentOff,
    };
  }),
  status: billingEnabledProcedure.query(async ({ ctx }) => {
    const [subscription, teamRecords] = await Promise.all([
      syncSubscription(ctx, ctx.userId),
      ctx.db
        .select({
          planId: billing.planId,
          status: billing.status,
          cancelAt: billing.cancelAt,
          mode: billing.mode,
          priceId: billing.priceId,
          currentPeriodEnd: billing.currentPeriodEnd,
          stripeCustomerId: billing.stripeCustomerId,
        })
        .from(billing)
        .innerJoin(member, eq(billing.organizationId, member.organizationId))
        .where(
          and(
            eq(member.userId, ctx.userId),
            isNotNull(billing.organizationId),
            or(like(billing.planId, "pro_team%"), like(billing.planId, "max_team%")),
          ),
        ),
    ]);

    const now = new Date();
    const teamRecord = teamRecords.find((candidate) => {
      const teamActive =
        candidate.planId && candidate.status && ACTIVE_SUB_STATUSES.has(candidate.status);
      const teamGrace =
        candidate.status === "canceled" &&
        candidate.currentPeriodEnd &&
        candidate.currentPeriodEnd > now;

      return teamActive || teamGrace;
    });

    if (teamRecord) {
      return {
        planId: teamRecord.planId ?? null,
        status: teamRecord.status ?? null,
        mode: (teamRecord.mode as "subscription" | "payment" | null) ?? null,
        cancelAt: teamRecord.cancelAt,
        priceId: teamRecord.priceId ?? null,
        currentPeriodEnd: teamRecord.currentPeriodEnd ?? null,
        stripeCustomerId: teamRecord.stripeCustomerId,
        isTeamPlan: true,
      };
    }

    return {
      planId: subscription.planId ?? null,
      status: subscription.status ?? null,
      mode: subscription.mode ?? null,
      cancelAt: subscription.cancelAt,
      priceId: subscription.priceId ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd ?? null,
      stripeCustomerId: subscription.stripeCustomerId,
      isTeamPlan: false,
    };
  }),
  createCheckoutSession: billingEnabledProcedure
    .input(
      z.object({
        planId: planIdSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = findPlanById(input.planId);
      if (!plan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unknown plan.",
        });
      }

      await syncSubscription(ctx, ctx.userId);

      const billingRecord = await ensureBillingRecord(ctx, ctx.userId);

      const price = await getPriceForPlan(plan);
      const mode = deriveModeFromPrice(price);
      const couponId = getFlashOfferCouponId();
      const flashOfferActive = isFlashOfferActive(billingRecord.flashOfferEndsAt);
      const flashOfferEligible = Boolean(couponId && isFlashOfferPlan(plan.id) && flashOfferActive);

      const reusableSession = await reuseOpenCheckoutSession({
        checkoutSessionId: billingRecord.checkoutSessionId,
        userId: ctx.userId,
        planId: plan.id,
      });

      if (reusableSession) {
        return {
          sessionId: reusableSession.id,
          clientSecret: reusableSession.client_secret,
        };
      }

      if (mode === "subscription") {
        const existingSubs = await stripe.subscriptions.list({
          customer: billingRecord.stripeCustomerId,
          status: "all",
          limit: 10,
        });

        const activeSub = existingSubs.data.find(
          (sub) =>
            !isMaxModeOnlySubscription(sub) &&
            (ACTIVE_SUB_STATUSES.has(sub.status) || sub.cancel_at_period_end === true),
        );

        if (activeSub) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You already have an active subscription. Use Change plan or cancel first.",
          });
        }
      }

      if (
        mode === "payment" &&
        billingRecord.planId === plan.id &&
        billingRecord.status === "paid"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This one-time plan has already been purchased.",
        });
      }

      const session = await stripe.checkout.sessions.create(
        {
          mode: mode === "payment" ? "payment" : "subscription",
          ui_mode: "elements",
          customer: billingRecord.stripeCustomerId,
          client_reference_id: ctx.userId,
          adaptive_pricing: {
            enabled: true,
          },
          line_items: [
            {
              price: price.id,
              quantity: 1,
            },
          ],
          metadata: {
            userId: ctx.userId,
            planId: plan.id,
          },
          subscription_data:
            mode === "subscription"
              ? {
                  metadata: {
                    userId: ctx.userId,
                    planId: plan.id,
                  },
                }
              : undefined,
          discounts: flashOfferEligible ? [{ coupon: couponId! }] : undefined,
          payment_method_options: checkoutCardPaymentMethodOptions,
          payment_intent_data:
            mode === "payment"
              ? {
                  metadata: {
                    userId: ctx.userId,
                    planId: plan.id,
                    priceId: price.id,
                  },
                }
              : undefined,
          allow_promotion_codes: flashOfferEligible ? undefined : true,
          return_url: `${new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin}/settings/billing/checkout/{CHECKOUT_SESSION_ID}`,
        },
        customCheckoutRequestOptions,
      );

      // Only remember the session for reuse. The plan changes once Stripe confirms
      // payment; marking the row "pending" here would revoke a lifetime plan (or any
      // current access) as soon as the user merely opened checkout.
      await ctx.db
        .update(billing)
        .set({ checkoutSessionId: session.id, updatedAt: new Date() })
        .where(and(eq(billing.userId, ctx.userId), isNull(billing.organizationId)));

      if (!session.client_secret) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe did not return a checkout client secret.",
        });
      }

      return { sessionId: session.id, clientSecret: session.client_secret };
    }),
  getCheckoutSession: billingEnabledProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const session = await stripe.checkout.sessions.retrieve(
        input.sessionId,
        { expand: [...checkoutSessionExpand] },
        customCheckoutRequestOptions,
      );

      if (!session.client_reference_id || session.client_reference_id !== ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Session does not belong to the current user.",
        });
      }

      return summarizeCheckoutSession(session);
    }),
  confirmCheckout: billingEnabledProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await stripe.checkout.sessions.retrieve(input.sessionId, {
        expand: ["subscription", "payment_intent.latest_charge", "line_items"],
      });

      if (!session.client_reference_id || session.client_reference_id !== ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Session does not belong to the current user.",
        });
      }

      // Team and ad checkouts share client_reference_id; they must never be bound
      // to the personal billing row.
      if (session.metadata?.organizationId || session.metadata?.adCampaignId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This checkout session is not a personal plan purchase.",
        });
      }

      const billingRecord = await ensureBillingRecord(ctx, ctx.userId);
      const subscription =
        session.subscription && typeof session.subscription !== "string" && session.subscription;

      const paymentIntent = session.payment_intent;

      const linePrice =
        session.line_items?.data.at(0)?.price ??
        (subscription && typeof subscription !== "string" && "items" in subscription
          ? subscription.items.data.at(0)?.price
          : undefined);

      const plan =
        getPlanFromPrice(linePrice ?? null) ??
        findPlanById((session.metadata?.planId as string) ?? "");

      const resolvedMode =
        deriveModeFromPrice(linePrice ?? null) ??
        (session.mode === "payment" ? "payment" : "subscription");

      const updates: Partial<BillingRecord> = {
        stripeCustomerId:
          (session.customer as string | null | undefined) ?? billingRecord.stripeCustomerId,
        planId: plan?.id ?? billingRecord.planId,
        priceId: linePrice?.id ?? billingRecord.priceId,
        mode: resolvedMode,
        checkoutSessionId: session.id,
      };

      if (subscription) {
        const fingerprintUpdates = await getBillingFingerprintUpdates({
          customerId:
            (session.customer as string | null | undefined) ?? billingRecord.stripeCustomerId,
        });
        updates.stripeSubscriptionId = subscription.id;
        updates.status = resolveSubscriptionStatus(subscription);
        updates.currentPeriodEnd = getSubscriptionPeriodEndDate(subscription);
        updates.firstPaidAt = billingRecord.firstPaidAt ?? new Date();
        updates.flashOfferEndsAt = null;
        updates.paymentMethodFingerprint = fingerprintUpdates.paymentMethodFingerprint;
        if (fingerprintUpdates.cardFunding) {
          updates.cardFunding = fingerprintUpdates.cardFunding;
        }
      } else if (!isPaidCheckoutPaymentCurrent(session)) {
        // A refunded or disputed one-time payment keeps its "succeeded"/"paid"
        // status, so replaying the session must not restore the revoked plan.
      } else if (
        paymentIntent &&
        typeof paymentIntent !== "string" &&
        paymentIntent.status === "succeeded"
      ) {
        const fingerprintUpdates = await getBillingFingerprintUpdates({
          customerId:
            (session.customer as string | null | undefined) ?? billingRecord.stripeCustomerId,
        });
        updates.status = "paid";
        updates.mode = "payment";
        updates.firstPaidAt = billingRecord.firstPaidAt ?? new Date();
        updates.flashOfferEndsAt = null;
        updates.paymentMethodFingerprint = fingerprintUpdates.paymentMethodFingerprint;
        if (fingerprintUpdates.cardFunding) {
          updates.cardFunding = fingerprintUpdates.cardFunding;
        }
      } else if (session.payment_status === "paid") {
        const fingerprintUpdates = await getBillingFingerprintUpdates({
          customerId:
            (session.customer as string | null | undefined) ?? billingRecord.stripeCustomerId,
        });
        updates.status = "paid";
        updates.firstPaidAt = billingRecord.firstPaidAt ?? new Date();
        updates.flashOfferEndsAt = null;
        updates.paymentMethodFingerprint = fingerprintUpdates.paymentMethodFingerprint;
        if (fingerprintUpdates.cardFunding) {
          updates.cardFunding = fingerprintUpdates.cardFunding;
        }
      }

      const grantsAccess = updates.status === "paid" || grantsSubscriptionAccess(updates.status);
      // An unpaid session must not change the plan: the row's current status would
      // otherwise vouch for whatever plan that session was opened for. A subscription
      // that grants nothing (e.g. incomplete) must not replace a paid lifetime plan.
      if (!updates.status || (!grantsAccess && isPaidLifetimeRecord(billingRecord))) {
        return {
          planId: billingRecord.planId ?? null,
          status: billingRecord.status ?? null,
          mode: billingRecord.mode ?? null,
          currentPeriodEnd: billingRecord.currentPeriodEnd ?? null,
        };
      }

      // A refund can land between the session fetch above and the write; recheck
      // the live charge under the same user lock that reversal handling takes.
      if (!subscription && updates.status === "paid" && isLifetimePlanId(plan?.id)) {
        const saved = await saveLifetimePlan(ctx.db, {
          userId: ctx.userId,
          customerId: updates.stripeCustomerId ?? "",
          purchase: {
            planId: plan.id,
            priceId: updates.priceId ?? null,
            checkoutSessionId: session.id,
          },
          extra: updates,
        });
        if (!saved) {
          return {
            planId: billingRecord.planId ?? null,
            status: billingRecord.status ?? null,
            mode: billingRecord.mode ?? null,
            currentPeriodEnd: billingRecord.currentPeriodEnd ?? null,
          };
        }
        return {
          planId: saved.planId ?? null,
          status: saved.status ?? null,
          mode: saved.mode ?? null,
          currentPeriodEnd: saved.currentPeriodEnd ?? null,
        };
      }

      const [saved] = await ctx.db
        .insert(billing)
        .values([
          {
            userId: ctx.userId,
            stripeCustomerId: updates.stripeCustomerId ?? "",
            ...updates,
          },
        ])
        .onConflictDoUpdate({
          target: billing.userId,
          targetWhere: sql`organization_id IS NULL`,
          set: {
            ...updates,
            updatedAt: new Date(),
          },
        })
        .returning();

      return {
        planId: saved.planId ?? null,
        status: saved.status ?? null,
        mode: saved.mode ?? null,
        currentPeriodEnd: saved.currentPeriodEnd ?? null,
      };
    }),
  createPortalSession: billingEnabledProcedure.mutation(async ({ ctx }) => {
    const subscription = await syncSubscription(ctx, ctx.userId);

    const portal = await createBillingPortalSession(
      subscription.stripeCustomerId,
      "/settings/billing",
    );

    return { url: portal.url };
  }),
  changePlan: billingEnabledProcedure
    .input(
      z.object({
        planId: planIdSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = findPlanById(input.planId);
      if (!plan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target plan must be a subscription plan.",
        });
      }

      const price = await getPriceForPlan(plan);
      const mode = deriveModeFromPrice(price);
      if (mode !== "subscription") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target plan must be a subscription plan.",
        });
      }

      const subscriptionState = await syncSubscription(ctx, ctx.userId);
      if (!subscriptionState.stripeSubscriptionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active subscription found. Start with checkout instead.",
        });
      }

      const subscription = await stripe.subscriptions.retrieve(
        subscriptionState.stripeSubscriptionId,
        { expand: ["items"] },
      );

      const item = getLicensedSubscriptionItem(subscription) ?? subscription.items.data.at(0);
      if (!item?.id || isMeteredMaxModePrice(item.price)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Subscription has no billable items to update.",
        });
      }

      const updated = await stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: price.id }],
        metadata: { userId: ctx.userId, planId: plan.id },
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
      });

      const updates: Partial<BillingRecord> = {
        planId: plan.id,
        priceId: price.id,
        mode,
        status: updated.cancel_at_period_end ? "canceled" : updated.status,
        currentPeriodEnd: getSubscriptionPeriodEndDate(updated),
        stripeSubscriptionId: updated.id,
      };

      const [savedSnapshot] = await ctx.db
        .insert(billing)
        .values({
          userId: ctx.userId,
          stripeCustomerId: subscription.customer as string,
          ...updates,
        })
        .onConflictDoUpdate({
          target: billing.userId,
          targetWhere: sql`organization_id IS NULL`,
          set: {
            ...updates,
            updatedAt: new Date(),
          },
          setWhere: unchangedBillingSnapshot(subscriptionState),
        })
        .returning();
      const saved = savedSnapshot ?? (await ensureBillingRecord(ctx, ctx.userId));

      if (saved?.maxModeEnabled) {
        await attachMaxModeMeteredItems(saved, ctx.userId);
      }

      return {
        planId: saved.planId ?? null,
        status: saved.status ?? null,
        mode: saved.mode ?? null,
        currentPeriodEnd: saved.currentPeriodEnd ?? null,
      };
    }),
  cancelSubscription: billingEnabledProcedure.mutation(async ({ ctx }) => {
    const subscriptionState = await syncSubscription(ctx, ctx.userId);
    if (!subscriptionState.stripeSubscriptionId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No active subscription to cancel.",
      });
    }

    const canceled = await stripe.subscriptions.update(subscriptionState.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const updates: Partial<BillingRecord> = {
      status: canceled.cancel_at_period_end ? "canceled" : canceled.status,
      currentPeriodEnd:
        getSubscriptionPeriodEndDate(canceled) ?? subscriptionState.currentPeriodEnd,
    };

    const [savedSnapshot] = await ctx.db
      .insert(billing)
      .values({
        userId: ctx.userId,
        stripeCustomerId: subscriptionState.stripeCustomerId,
        stripeSubscriptionId: subscriptionState.stripeSubscriptionId,
        ...updates,
      })
      .onConflictDoUpdate({
        target: billing.userId,
        targetWhere: sql`organization_id IS NULL`,
        set: {
          ...updates,
          updatedAt: new Date(),
        },
        setWhere: unchangedBillingSnapshot(subscriptionState),
      })
      .returning();
    const saved = savedSnapshot ?? (await ensureBillingRecord(ctx, ctx.userId));

    return {
      planId: saved.planId ?? null,
      status: saved.status ?? null,
      mode: saved.mode ?? null,
      currentPeriodEnd: saved.currentPeriodEnd ?? null,
    };
  }),
  resumeSubscription: billingEnabledProcedure.mutation(async ({ ctx }) => {
    const subscriptionState = await syncSubscription(ctx, ctx.userId);
    if (!subscriptionState.stripeSubscriptionId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No subscription to resume.",
      });
    }

    const resumed = await stripe.subscriptions.update(subscriptionState.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    const price = getLicensedPrice(resumed) ?? resumed.items.data.at(0)?.price ?? null;
    const plan =
      getPlanFromPrice(price) ??
      findPlanById(resumed.metadata?.planId ?? "") ??
      (subscriptionState.planId ? findPlanById(subscriptionState.planId) : null);

    const updates: Partial<BillingRecord> = {
      status: resumed.status,
      currentPeriodEnd: getSubscriptionPeriodEndDate(resumed),
      stripeSubscriptionId: resumed.id,
      priceId: price?.id ?? subscriptionState.priceId,
      planId: plan?.id ?? subscriptionState.planId,
      mode: deriveModeFromPrice(price),
    };

    const [savedSnapshot] = await ctx.db
      .insert(billing)
      .values({
        userId: ctx.userId,
        stripeCustomerId: subscriptionState.stripeCustomerId,
        ...updates,
      })
      .onConflictDoUpdate({
        target: billing.userId,
        targetWhere: sql`organization_id IS NULL`,
        set: {
          ...updates,
          updatedAt: new Date(),
        },
        setWhere: unchangedBillingSnapshot(subscriptionState),
      })
      .returning();
    const saved = savedSnapshot ?? (await ensureBillingRecord(ctx, ctx.userId));

    return {
      planId: saved.planId ?? null,
      status: saved.status ?? null,
      mode: saved.mode ?? null,
      currentPeriodEnd: saved.currentPeriodEnd ?? null,
    };
  }),
  usage: protectedProcedure.query(async ({ ctx }) => {
    const summary = await getUsageSummary({
      userId: ctx.userId,
      isAnonymous: Boolean(ctx.session?.user?.isAnonymous),
    });
    return summary;
  }),
  estimatePlanChange: billingEnabledProcedure
    .input(
      z.object({
        planId: planIdSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const plan = findPlanById(input.planId);
      if (!plan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target plan must be a subscription plan.",
        });
      }

      const price = await getPriceForPlan(plan);
      const mode = deriveModeFromPrice(price);
      if (mode !== "subscription") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target plan must be a subscription plan.",
        });
      }

      const subscriptionState = await syncSubscription(ctx, ctx.userId);

      if (!subscriptionState.stripeSubscriptionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active subscription to estimate against.",
        });
      }

      const subscription = await stripe.subscriptions.retrieve(
        subscriptionState.stripeSubscriptionId,
        { expand: ["items"] },
      );
      const item = getLicensedSubscriptionItem(subscription) ?? subscription.items.data.at(0);
      if (!item?.id || isMeteredMaxModePrice(item.price)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Subscription has no billable items to estimate.",
        });
      }

      if (item.price?.id === price.id) {
        return {
          amountDue: 0,
          currency: item.price?.currency ?? subscription.currency ?? null,
        };
      }

      const upcoming = await stripe.invoices.createPreview({
        customer: subscription.customer as string,
        subscription: subscription.id,
        subscription_details: {
          items: [
            {
              id: item.id,
              price: price.id,
            },
          ],
          proration_behavior: "always_invoice",
        },
      });

      return {
        amountDue: upcoming.amount_due ?? 0,
        currency: upcoming.currency ?? item.price?.currency ?? null,
        nextPaymentAttempt: upcoming.next_payment_attempt
          ? new Date(upcoming.next_payment_attempt * 1000)
          : null,
      };
    }),
  // Max Mode endpoints
  maxModeStatus: protectedProcedure.query(async ({ ctx }) => {
    return getMaxModeStatus(ctx.userId);
  }),
  enableMaxMode: billingEnabledProcedure.mutation(async ({ ctx }) => {
    const result = await enableMaxMode(ctx.userId);
    if (!result.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: result.error ?? "Failed to enable Max Mode.",
      });
    }
    return { success: true };
  }),
  disableMaxMode: billingEnabledProcedure.mutation(async ({ ctx }) => {
    const result = await disableMaxMode(ctx.userId);
    if (!result.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: result.error ?? "Failed to disable Max Mode.",
      });
    }
    return { success: true };
  }),
  // ---- Free-tier card verification (manual-capture auth, then cancel) ----
  createCardSetupIntent: billingEnabledProcedure.mutation(async ({ ctx }) => {
    const billingRecord = await ensureBillingRecord(ctx, ctx.userId);
    // $1.00 (USD has cents → amount=100) authorization. We never capture —
    // the bank auth itself is the verification, and we cancel immediately to
    // release the hold.
    const intent = await stripe.paymentIntents.create({
      customer: billingRecord.stripeCustomerId,
      amount: 100,
      currency: "usd",
      allowed_payment_method_types: ["card"],
      capture_method: "manual",
      setup_future_usage: "off_session",
      description: "Card verification (released immediately, never charged)",
      payment_method_options: {
        card: {
          request_three_d_secure: requestThreeDSecure,
        },
      },
      metadata: {
        userId: ctx.userId,
        purpose: "free_tier_verification",
      },
    });
    if (!intent.client_secret) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Stripe did not return a client secret for the verification intent.",
      });
    }
    return {
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
    };
  }),
  confirmCardSetup: billingEnabledProcedure
    .input(z.object({ paymentIntentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const billingRecord = await ensureBillingRecord(ctx, ctx.userId);
      const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId, {
        expand: ["payment_method"],
      });

      const intentCustomerId =
        typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
      if (
        intent.metadata?.userId !== ctx.userId ||
        intent.metadata?.purpose !== "free_tier_verification" ||
        intentCustomerId !== billingRecord.stripeCustomerId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Verification intent does not belong to you.",
        });
      }
      // Manual capture: a successful auth lands the PI in `requires_capture`.
      // `succeeded` would mean it was somehow captured (shouldn't happen here).
      if (intent.status !== "requires_capture" && intent.status !== "succeeded") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Verification not yet authorized (status: ${intent.status}).`,
        });
      }

      const paymentMethod = intent.payment_method;
      const pm =
        typeof paymentMethod === "string"
          ? await stripe.paymentMethods.retrieve(paymentMethod)
          : paymentMethod;
      if (!pm || pm.type !== "card" || !pm.card?.fingerprint) {
        // Release the hold before erroring out.
        if (intent.status === "requires_capture") {
          await stripe.paymentIntents.cancel(intent.id).catch(() => {});
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only card payment methods are supported.",
        });
      }

      const fingerprint = pm.card.fingerprint;
      const funding: CardFunding =
        pm.card.funding === "credit" || pm.card.funding === "debit" || pm.card.funding === "prepaid"
          ? pm.card.funding
          : "unknown";

      const eligibility = await claimCardVerification(ctx.db, {
        fingerprint,
        funding,
        userId: ctx.userId,
        customerId: billingRecord.stripeCustomerId,
      });
      if (!eligibility.eligible) {
        // Always release the $1 USD hold first.
        if (intent.status === "requires_capture") {
          await stripe.paymentIntents.cancel(intent.id).catch((err) => {
            console.warn("[billing] Failed to cancel rejected verification PI", err);
          });
        }
        try {
          await stripe.paymentMethods.detach(pm.id);
        } catch (err) {
          console.warn("[billing] Failed to detach rejected payment method", err);
        }
        // Don't leak the limit policy — surface a generic decline. Log the
        // real reason server-side for support.
        console.info("[billing] Card verification declined by eligibility policy", {
          userId: ctx.userId,
          reason: eligibility.reason,
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Your card was declined. Please try a different card.",
        });
      }

      // Auth passed and eligibility passed — release the $1 USD hold now.
      if (intent.status === "requires_capture") {
        await stripe.paymentIntents.cancel(intent.id).catch((err) => {
          console.warn("[billing] Failed to cancel verification PI after success", err);
        });
      }

      // Ensure it's also attached + set as default for future invoices.
      try {
        await stripe.customers.update(billingRecord.stripeCustomerId, {
          invoice_settings: { default_payment_method: pm.id },
        });
      } catch (err) {
        console.warn("[billing] Failed to set default payment method", err);
      }

      const saved = eligibility.record;

      return {
        verified: true,
        funding,
        cardVerifiedAt: saved?.cardVerifiedAt?.toISOString() ?? null,
      };
    }),
  removeVerifiedCard: billingEnabledProcedure.mutation(async ({ ctx }) => {
    const billingRecord = await ensureBillingRecord(ctx, ctx.userId);
    // Refuse to remove if there's an active subscription depending on the card.
    if (billingRecord.stripeSubscriptionId && ACTIVE_SUB_STATUSES.has(billingRecord.status ?? "")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cancel your subscription before removing the card.",
      });
    }
    try {
      const paymentMethods = await stripe.customers.listPaymentMethods(
        billingRecord.stripeCustomerId,
        { type: "card", limit: 10 },
      );
      await Promise.all(
        paymentMethods.data.map((pm) =>
          stripe.paymentMethods.detach(pm.id).catch((err) => {
            console.warn("[billing] Failed to detach payment method", err);
          }),
        ),
      );
    } catch (err) {
      console.warn("[billing] Failed to list payment methods on removal", err);
    }
    await ctx.db
      .update(billing)
      .set({
        paymentMethodFingerprint: null,
        cardFunding: null,
        cardVerifiedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(billing.userId, ctx.userId), isNull(billing.organizationId)));
    return { removed: true };
  }),
});
