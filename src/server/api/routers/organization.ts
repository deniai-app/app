import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  billing,
  member,
  teamMemberUsagePolicy,
  teamUsageAuditLog,
  teamUsagePolicy,
  usageQuota,
  user,
} from "@/db/schema";
import { env } from "@/env";
import { type BillingPlan, billingPlans, findPlanById, isTeamPlan } from "@/lib/billing";
import {
  getCustomerPrimaryCardFingerprint,
  isTrialFingerprintEligible,
} from "@/lib/billing-card-usage";
import { isBillingDisabled } from "@/lib/billing-config";
import { TEAM_SUBSCRIPTION_TRIAL_DAYS, TEAM_TRIAL_MAX_SEATS } from "@/lib/billing-offers";
import { isTrialEligibleForCustomer } from "@/lib/billing-trials";
import { escapeStripeSearchValue } from "@/lib/stripe-search";
import { stripe } from "@/lib/stripe";
import { createBillingPortalSession } from "@/lib/stripe-portal";
import {
  checkoutCardPaymentMethodOptions,
  customCheckoutRequestOptions,
} from "@/lib/stripe-checkout";
import { checkoutSessionExpand, summarizeCheckoutSession } from "@/lib/stripe-checkout-receipt";
import { attachMaxModeMeteredItems } from "@/lib/max-mode-stripe";
import {
  getLicensedPrice,
  getLicensedSubscriptionItem,
  getSubscriptionPeriodEndDate,
  isMaxModeOnlySubscription,
  isMeteredMaxModePrice,
  pickLicensedSubscription,
} from "@/lib/stripe-subscriptions";
import { getOrgMemberCount, updateTeamSeatCount } from "@/lib/team-billing";
import {
  findTeamBillingRecord,
  saveTeamBillingRecord,
  withTeamBillingLock,
} from "@/lib/team-billing-record";
import { getUsageLimitConfig } from "@/lib/usage";
import { type ProtectedContext, protectedProcedure, router } from "../trpc";
import { historyBefore, historyCursorSchema, historyCursorTimestamp } from "../history-pagination";

import type Stripe from "stripe";

const teamPlanIdSchema = z.enum([
  "pro_team_monthly",
  "pro_team_yearly",
  "max_team_monthly",
  "max_team_yearly",
]);
const maxModeLimitSchema = z.number().int().min(0).nullable();

type BillingRecord = typeof billing.$inferSelect;

const ACTIVE_SUB_STATUSES = new Set(["trialing", "active", "past_due"]);

const billingEnabledProcedure = protectedProcedure.use(({ next }) => {
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

async function findPriceForPlan(plan: BillingPlan) {
  const prices = await stripe.prices.list({
    lookup_keys: [plan.lookupKey],
    active: true,
    limit: 1,
  });
  return prices.data.at(0) ?? null;
}

async function getPriceForPlan(plan: BillingPlan) {
  const price = await findPriceForPlan(plan);
  if (!price) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unable to load ${plan.lookupKey} price. Configure lookup_key=${plan.lookupKey} in Stripe.`,
    });
  }

  return price;
}

async function verifyOrgOwner(ctx: ProtectedContext, organizationId: string) {
  const [memberRecord] = await ctx.db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, ctx.userId)))
    .limit(1);

  if (!memberRecord || memberRecord.role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only organization owners can manage team billing.",
    });
  }
}

// Same as verifyOrgOwner, but also allows the "admin" role for non-financial
// settings (Max Mode policy, audit log viewing, cancel/resume of an existing
// subscription). Purchasing, changing plans, and the Stripe billing portal
// stay owner-only via verifyOrgOwner.
async function verifyOrgOwnerOrAdmin(ctx: ProtectedContext, organizationId: string) {
  const [memberRecord] = await ctx.db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, ctx.userId)))
    .limit(1);

  if (!memberRecord || (memberRecord.role !== "owner" && memberRecord.role !== "admin")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only organization owners or admins can manage this.",
    });
  }
}

async function getOwnedTeamBillingRecord(ctx: ProtectedContext, organizationId: string) {
  await verifyOrgOwnerOrAdmin(ctx, organizationId);
  const subscription = await syncTeamSubscription(ctx, ctx.userId, organizationId);
  if (!subscription.planId || !isTeamPlan(subscription.planId)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "An active team subscription is required to manage Max Mode.",
    });
  }

  if (subscription.status !== "active") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Max Mode requires an active team subscription.",
    });
  }

  return subscription;
}

async function ensureTeamUsagePolicy(ctx: ProtectedContext, organizationId: string) {
  const [policy] = await ctx.db
    .insert(teamUsagePolicy)
    .values({ organizationId })
    .onConflictDoNothing({ target: teamUsagePolicy.organizationId })
    .returning();

  if (policy) {
    return policy;
  }

  const [existing] = await ctx.db
    .select()
    .from(teamUsagePolicy)
    .where(eq(teamUsagePolicy.organizationId, organizationId))
    .limit(1);

  if (!existing) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to load team usage policy.",
    });
  }

  return existing;
}

async function recordTeamUsageAuditLog({
  ctx,
  organizationId,
  action,
  targetUserId,
  metadata,
}: {
  ctx: ProtectedContext;
  organizationId: string;
  action: string;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await ctx.db.insert(teamUsageAuditLog).values({
    organizationId,
    actorUserId: ctx.userId,
    targetUserId: targetUserId ?? null,
    action,
    metadata,
  });
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
  organizationId,
}: {
  email: string;
  name?: string | null;
  userId: string;
  organizationId: string;
}) {
  let customer: Stripe.Customer | undefined;

  try {
    const search = await stripe.customers.search({
      query: `metadata['organizationId']:'${escapeStripeSearchValue(organizationId)}'`,
      limit: 1,
    });
    customer = search.data[0];
  } catch (error) {
    console.warn("Stripe customer search failed, falling back to create", error);
  }

  if (customer) {
    return customer;
  }

  return stripe.customers.create({
    email,
    name: name ? `${name} (Team)` : undefined,
    metadata: { userId, organizationId },
  });
}

async function ensureTeamBillingRecord(
  ctx: ProtectedContext,
  userId: string,
  organizationId: string,
) {
  return withTeamBillingLock(ctx.db, organizationId, async (transaction) => {
    const existing = await findTeamBillingRecord(transaction, organizationId);
    if (existing) return existing;
    const profile = await fetchUserProfile(ctx, userId);
    const customer = await findOrCreateStripeCustomer({
      email: profile.email,
      name: profile.name,
      userId,
      organizationId,
    });
    const [created] = await transaction
      .insert(billing)
      .values({
        userId,
        organizationId,
        stripeCustomerId: customer.id,
        status: "inactive",
      })
      .returning();
    if (!created) throw new Error("Unable to create team billing record.");
    return created;
  });
}

async function syncTeamSubscription(ctx: ProtectedContext, userId: string, organizationId: string) {
  const billingRecord = await ensureTeamBillingRecord(ctx, userId, organizationId);

  const subscriptions = await stripe.subscriptions.list({
    customer: billingRecord.stripeCustomerId,
    status: "all",
    limit: 5,
    expand: ["data.default_payment_method"],
  });

  const bestSub = pickLicensedSubscription(subscriptions.data, (status) =>
    ACTIVE_SUB_STATUSES.has(status),
  );
  const subscriptionId = bestSub?.id;
  if (!subscriptionId) {
    return saveTeamBillingRecord(ctx.db, billingRecord.userId, organizationId, {
      stripeCustomerId: billingRecord.stripeCustomerId,
      stripeSubscriptionId: null,
      planId: null,
      priceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      cancelAt: null,
    });
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const updates: Partial<BillingRecord> = {};

  if (subscription) {
    const price = getLicensedPrice(subscription) ?? subscription.items.data.at(0)?.price ?? null;
    // The billed price is authoritative; metadata is not updated by portal plan changes.
    const plan =
      billingPlans.find((p) => p.lookupKey === price?.lookup_key) ??
      findPlanById(subscription.metadata?.planId ?? "");
    const status = subscription.status;

    updates.stripeSubscriptionId = subscription.id;
    updates.priceId = price?.id;
    updates.planId = plan?.id ?? billingRecord.planId;
    updates.cancelAt = subscription.cancel_at;
    updates.status =
      status === "canceled"
        ? "inactive"
        : subscription.cancel_at_period_end || subscription.cancel_at
          ? "canceled"
          : status;
    updates.mode = deriveModeFromPrice(price);
    updates.currentPeriodEnd = getSubscriptionPeriodEndDate(subscription);
  }
  if (Object.keys(updates).length === 0) {
    return billingRecord;
  }

  return saveTeamBillingRecord(ctx.db, billingRecord.userId, organizationId, {
    ...updates,
    stripeCustomerId: billingRecord.stripeCustomerId,
  });
}

async function reuseOpenTeamCheckoutSession({
  checkoutSessionId,
  userId,
  organizationId,
  planId,
}: {
  checkoutSessionId: string | null | undefined;
  userId: string;
  organizationId: string;
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
      session.metadata?.organizationId !== organizationId ||
      !session.client_secret
    ) {
      return null;
    }

    return session;
  } catch (error) {
    console.warn("Failed to reuse team checkout session", error);
    return null;
  }
}

export const organizationRouter = router({
  teamPlans: billingEnabledProcedure.query(async ({ ctx }) => {
    const teamPlans = billingPlans.filter((p) => isTeamPlan(p.id));
    const organizations = await ctx.db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(and(eq(member.userId, ctx.userId), eq(member.role, "owner")))
      .limit(1);
    const organizationId = organizations[0]?.organizationId;
    const billingRecord = organizationId
      ? await ensureTeamBillingRecord(ctx, ctx.userId, organizationId)
      : null;
    const memberCount = organizationId ? await getOrgMemberCount(organizationId) : 0;
    const trialFingerprint = billingRecord
      ? (billingRecord.paymentMethodFingerprint ??
        (await getCustomerPrimaryCardFingerprint(
          billingRecord.stripeCustomerId,
          billingRecord.stripeSubscriptionId,
        )))
      : null;
    const trialEligible = billingRecord
      ? (await isTrialEligibleForCustomer(billingRecord.stripeCustomerId)) &&
        (await isTrialFingerprintEligible(trialFingerprint, {
          customerId: billingRecord.stripeCustomerId,
          userId: ctx.userId,
          organizationId,
        }))
      : false;
    const showTrial = trialEligible && memberCount > 0 && memberCount <= TEAM_TRIAL_MAX_SEATS;
    const plans = (
      await Promise.all(
        teamPlans.map(async (plan) => {
          const price = await findPriceForPlan(plan);
          if (!price) {
            return null;
          }
          const mode = deriveModeFromPrice(price);
          return {
            id: plan.id,
            lookupKey: plan.lookupKey,
            mode,
            priceId: price.id,
            amount: price.unit_amount,
            currency: price.currency,
            interval: price.recurring?.interval ?? null,
            intervalCount: price.recurring?.interval_count ?? 1,
            isTeamPlan: true,
            trialDays: showTrial ? TEAM_SUBSCRIPTION_TRIAL_DAYS : null,
          };
        }),
      )
    ).filter((plan) => plan !== null);
    return { plans };
  }),

  teamBillingStatus: billingEnabledProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await verifyOrgOwnerOrAdmin(ctx, input.organizationId);
      const [subscription, memberCount] = await Promise.all([
        syncTeamSubscription(ctx, ctx.userId, input.organizationId),
        getOrgMemberCount(input.organizationId),
      ]);
      return {
        planId: subscription.planId ?? null,
        status: subscription.status ?? null,
        mode: subscription.mode ?? null,
        cancelAt: subscription.cancelAt,
        priceId: subscription.priceId ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd ?? null,
        stripeCustomerId: subscription.stripeCustomerId,
        memberCount,
      };
    }),

  teamMaxModeSettings: billingEnabledProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await verifyOrgOwnerOrAdmin(ctx, input.organizationId);
      const auditActorUser = alias(user, "audit_actor_user");
      const auditTargetUser = alias(user, "audit_target_user");
      const [subscription, defaultPolicy, members, auditLog] = await Promise.all([
        syncTeamSubscription(ctx, ctx.userId, input.organizationId),
        ensureTeamUsagePolicy(ctx, input.organizationId),
        ctx.db
          .select({
            memberId: member.id,
            userId: member.userId,
            role: member.role,
            name: user.name,
            email: user.email,
            policyEnabled: teamMemberUsagePolicy.maxModeEnabled,
            policyLimitBasic: teamMemberUsagePolicy.maxModeLimitBasic,
            policyLimitPremium: teamMemberUsagePolicy.maxModeLimitPremium,
          })
          .from(member)
          .innerJoin(user, eq(member.userId, user.id))
          .leftJoin(
            teamMemberUsagePolicy,
            and(
              eq(teamMemberUsagePolicy.organizationId, member.organizationId),
              eq(teamMemberUsagePolicy.userId, member.userId),
            ),
          )
          .where(eq(member.organizationId, input.organizationId)),
        ctx.db
          .select({
            id: teamUsageAuditLog.id,
            actorUserId: teamUsageAuditLog.actorUserId,
            actorName: auditActorUser.name,
            actorEmail: auditActorUser.email,
            targetUserId: teamUsageAuditLog.targetUserId,
            targetName: auditTargetUser.name,
            targetEmail: auditTargetUser.email,
            action: teamUsageAuditLog.action,
            metadata: teamUsageAuditLog.metadata,
            createdAt: teamUsageAuditLog.createdAt,
          })
          .from(teamUsageAuditLog)
          .innerJoin(auditActorUser, eq(auditActorUser.id, teamUsageAuditLog.actorUserId))
          .leftJoin(auditTargetUser, eq(auditTargetUser.id, teamUsageAuditLog.targetUserId))
          .where(eq(teamUsageAuditLog.organizationId, input.organizationId))
          .orderBy(desc(teamUsageAuditLog.createdAt))
          .limit(5),
      ]);

      const memberIds = members.map((m) => m.userId);
      const usageRows =
        memberIds.length > 0
          ? await ctx.db
              .select({
                userId: usageQuota.userId,
                category: usageQuota.category,
                used: usageQuota.used,
              })
              .from(usageQuota)
              .where(inArray(usageQuota.userId, memberIds))
          : [];
      const usageByMember = new Map<string, { basic: number; premium: number }>();
      const basicIncluded = getUsageLimitConfig("basic", "pro").limit ?? 0;
      const premiumIncluded = getUsageLimitConfig("premium", "pro").limit ?? 0;

      for (const row of usageRows) {
        const current = usageByMember.get(row.userId) ?? { basic: 0, premium: 0 };
        if (row.category === "basic") {
          current.basic = Math.max(row.used - basicIncluded, 0);
        }
        if (row.category === "premium") {
          current.premium = Math.max(row.used - premiumIncluded, 0);
        }
        usageByMember.set(row.userId, current);
      }

      return {
        enabled: Boolean(subscription.maxModeEnabled),
        eligible: subscription.planId
          ? isTeamPlan(subscription.planId) && subscription.status === "active"
          : false,
        usageBasic: subscription.maxModeUsageBasic,
        usagePremium: subscription.maxModeUsagePremium,
        periodStart: subscription.maxModePeriodStart,
        defaultPolicy: {
          maxModeEnabled: defaultPolicy.defaultMaxModeEnabled,
          maxModeLimitBasic: defaultPolicy.defaultMaxModeLimitBasic,
          maxModeLimitPremium: defaultPolicy.defaultMaxModeLimitPremium,
        },
        members: members.map((m) => {
          const maxModeUsage = usageByMember.get(m.userId) ?? { basic: 0, premium: 0 };
          return {
            memberId: m.memberId,
            userId: m.userId,
            role: m.role,
            name: m.name,
            email: m.email,
            maxModeEnabled: m.policyEnabled ?? defaultPolicy.defaultMaxModeEnabled,
            maxModeLimitBasic: m.policyLimitBasic ?? defaultPolicy.defaultMaxModeLimitBasic ?? null,
            maxModeLimitPremium:
              m.policyLimitPremium ?? defaultPolicy.defaultMaxModeLimitPremium ?? null,
            maxModeUsageBasic: maxModeUsage.basic,
            maxModeUsagePremium: maxModeUsage.premium,
          };
        }),
        auditLog,
      };
    }),

  teamAuditLog: billingEnabledProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        cursor: historyCursorSchema.nullish(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifyOrgOwnerOrAdmin(ctx, input.organizationId);

      const actorUser = alias(user, "actor_user");
      const targetUser = alias(user, "target_user");

      const rows = await ctx.db
        .select({
          id: teamUsageAuditLog.id,
          action: teamUsageAuditLog.action,
          metadata: teamUsageAuditLog.metadata,
          createdAt: teamUsageAuditLog.createdAt,
          cursorCreatedAt: historyCursorTimestamp(teamUsageAuditLog.createdAt),
          actorId: teamUsageAuditLog.actorUserId,
          actorName: actorUser.name,
          actorEmail: actorUser.email,
          actorImage: actorUser.image,
          targetId: teamUsageAuditLog.targetUserId,
          targetName: targetUser.name,
          targetEmail: targetUser.email,
          targetImage: targetUser.image,
        })
        .from(teamUsageAuditLog)
        .innerJoin(actorUser, eq(actorUser.id, teamUsageAuditLog.actorUserId))
        .leftJoin(targetUser, eq(targetUser.id, teamUsageAuditLog.targetUserId))
        .where(
          and(
            eq(teamUsageAuditLog.organizationId, input.organizationId),
            historyBefore(teamUsageAuditLog, input.cursor),
          ),
        )
        .orderBy(desc(teamUsageAuditLog.createdAt), desc(teamUsageAuditLog.id))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      const nextCursor = hasMore && last ? { createdAt: last.cursorCreatedAt, id: last.id } : null;
      const items = page.map(({ cursorCreatedAt, ...item }) => {
        void cursorCreatedAt;
        return item;
      });

      return { items, nextCursor };
    }),

  updateTeamMaxModeDefaultPolicy: billingEnabledProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        maxModeEnabled: z.boolean(),
        maxModeLimitBasic: maxModeLimitSchema,
        maxModeLimitPremium: maxModeLimitSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyOrgOwnerOrAdmin(ctx, input.organizationId);
      const previousPolicy = await ensureTeamUsagePolicy(ctx, input.organizationId);

      await ctx.db
        .insert(teamUsagePolicy)
        .values({
          organizationId: input.organizationId,
          defaultMaxModeEnabled: input.maxModeEnabled,
          defaultMaxModeLimitBasic: input.maxModeLimitBasic,
          defaultMaxModeLimitPremium: input.maxModeLimitPremium,
        })
        .onConflictDoUpdate({
          target: teamUsagePolicy.organizationId,
          set: {
            defaultMaxModeEnabled: input.maxModeEnabled,
            defaultMaxModeLimitBasic: input.maxModeLimitBasic,
            defaultMaxModeLimitPremium: input.maxModeLimitPremium,
            updatedAt: new Date(),
          },
        });

      await recordTeamUsageAuditLog({
        ctx,
        organizationId: input.organizationId,
        action: "default_policy_updated",
        metadata: {
          previous: {
            maxModeEnabled: previousPolicy.defaultMaxModeEnabled,
            maxModeLimitBasic: previousPolicy.defaultMaxModeLimitBasic,
            maxModeLimitPremium: previousPolicy.defaultMaxModeLimitPremium,
          },
          next: {
            maxModeEnabled: input.maxModeEnabled,
            maxModeLimitBasic: input.maxModeLimitBasic,
            maxModeLimitPremium: input.maxModeLimitPremium,
          },
        },
      });

      return { success: true };
    }),

  updateTeamMaxModeEnabled: billingEnabledProcedure
    .input(z.object({ organizationId: z.string().min(1), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const subscription = await getOwnedTeamBillingRecord(ctx, input.organizationId);
      const updates: Partial<BillingRecord> = input.enabled
        ? {
            maxModeEnabled: true,
            maxModePeriodStart: subscription.maxModeEnabled
              ? subscription.maxModePeriodStart
              : new Date(),
            maxModeUsageBasic: subscription.maxModeEnabled ? subscription.maxModeUsageBasic : 0,
            maxModeUsagePremium: subscription.maxModeEnabled ? subscription.maxModeUsagePremium : 0,
            updatedAt: new Date(),
          }
        : {
            maxModeEnabled: false,
            updatedAt: new Date(),
          };

      if (input.enabled) {
        const attached = await attachMaxModeMeteredItems(subscription, ctx.userId);
        if (!attached.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: attached.error });
        }
        updates.stripeSubscriptionId = attached.subscriptionId;
        updates.stripeMeteredBasicItemId = attached.basicItemId;
        updates.stripeMeteredPremiumItemId = attached.premiumItemId;
      }

      await ctx.db.update(billing).set(updates).where(eq(billing.id, subscription.id));
      await recordTeamUsageAuditLog({
        ctx,
        organizationId: input.organizationId,
        action: input.enabled ? "max_mode_enabled" : "max_mode_disabled",
        metadata: {
          previous: { maxModeEnabled: Boolean(subscription.maxModeEnabled) },
          next: { maxModeEnabled: input.enabled },
        },
      });
      return { success: true };
    }),

  updateTeamMemberMaxModePolicy: billingEnabledProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        userId: z.string().min(1),
        maxModeEnabled: z.boolean(),
        maxModeLimitBasic: maxModeLimitSchema,
        maxModeLimitPremium: maxModeLimitSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyOrgOwnerOrAdmin(ctx, input.organizationId);
      const [targetMember] = await ctx.db
        .select({ id: member.id })
        .from(member)
        .where(
          and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)),
        )
        .limit(1);

      if (!targetMember) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member does not belong to this organization.",
        });
      }

      const [previousMemberPolicyRows, defaultPolicy] = await Promise.all([
        ctx.db
          .select({
            maxModeEnabled: teamMemberUsagePolicy.maxModeEnabled,
            maxModeLimitBasic: teamMemberUsagePolicy.maxModeLimitBasic,
            maxModeLimitPremium: teamMemberUsagePolicy.maxModeLimitPremium,
          })
          .from(teamMemberUsagePolicy)
          .where(
            and(
              eq(teamMemberUsagePolicy.organizationId, input.organizationId),
              eq(teamMemberUsagePolicy.userId, input.userId),
            ),
          )
          .limit(1),
        ensureTeamUsagePolicy(ctx, input.organizationId),
      ]);
      const [previousMemberPolicy] = previousMemberPolicyRows;

      await ctx.db
        .insert(teamMemberUsagePolicy)
        .values({
          organizationId: input.organizationId,
          userId: input.userId,
          maxModeEnabled: input.maxModeEnabled,
          maxModeLimitBasic: input.maxModeLimitBasic,
          maxModeLimitPremium: input.maxModeLimitPremium,
        })
        .onConflictDoUpdate({
          target: [teamMemberUsagePolicy.organizationId, teamMemberUsagePolicy.userId],
          set: {
            maxModeEnabled: input.maxModeEnabled,
            maxModeLimitBasic: input.maxModeLimitBasic,
            maxModeLimitPremium: input.maxModeLimitPremium,
            updatedAt: new Date(),
          },
        });
      await recordTeamUsageAuditLog({
        ctx,
        organizationId: input.organizationId,
        action: "member_policy_updated",
        targetUserId: input.userId,
        metadata: {
          previous: {
            maxModeEnabled:
              previousMemberPolicy?.maxModeEnabled ?? defaultPolicy.defaultMaxModeEnabled,
            maxModeLimitBasic:
              previousMemberPolicy?.maxModeLimitBasic ?? defaultPolicy.defaultMaxModeLimitBasic,
            maxModeLimitPremium:
              previousMemberPolicy?.maxModeLimitPremium ?? defaultPolicy.defaultMaxModeLimitPremium,
          },
          next: {
            maxModeEnabled: input.maxModeEnabled,
            maxModeLimitBasic: input.maxModeLimitBasic,
            maxModeLimitPremium: input.maxModeLimitPremium,
          },
        },
      });

      return { success: true };
    }),

  createTeamCheckoutSession: billingEnabledProcedure
    .input(
      z.object({
        planId: teamPlanIdSchema,
        organizationId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyOrgOwner(ctx, input.organizationId);

      const plan = findPlanById(input.planId);
      if (!plan) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown plan." });
      }

      await syncTeamSubscription(ctx, ctx.userId, input.organizationId);
      const billingRecord = await ensureTeamBillingRecord(ctx, ctx.userId, input.organizationId);
      const trialFingerprint =
        billingRecord.paymentMethodFingerprint ??
        (await getCustomerPrimaryCardFingerprint(
          billingRecord.stripeCustomerId,
          billingRecord.stripeSubscriptionId,
        ));
      const trialEligible =
        (await isTrialEligibleForCustomer(billingRecord.stripeCustomerId)) &&
        (await isTrialFingerprintEligible(trialFingerprint, {
          customerId: billingRecord.stripeCustomerId,
          userId: ctx.userId,
          organizationId: input.organizationId,
        }));

      const [price, reusableSession] = await Promise.all([
        getPriceForPlan(plan),
        reuseOpenTeamCheckoutSession({
          checkoutSessionId: billingRecord.checkoutSessionId,
          userId: ctx.userId,
          organizationId: input.organizationId,
          planId: plan.id,
        }),
      ]);

      if (reusableSession) {
        return {
          sessionId: reusableSession.id,
          clientSecret: reusableSession.client_secret,
        };
      }

      // Check for existing active subscription
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
          message: "This team already has an active subscription. Use Change plan or cancel first.",
        });
      }

      const memberCount = await getOrgMemberCount(input.organizationId);
      const applyTrial = trialEligible && memberCount > 0 && memberCount <= TEAM_TRIAL_MAX_SEATS;

      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          ui_mode: "elements",
          customer: billingRecord.stripeCustomerId,
          client_reference_id: ctx.userId,
          adaptive_pricing: {
            enabled: true,
          },
          line_items: [
            {
              price: price.id,
              quantity: memberCount,
            },
          ],
          metadata: {
            userId: ctx.userId,
            planId: plan.id,
            organizationId: input.organizationId,
          },
          subscription_data: {
            metadata: {
              userId: ctx.userId,
              planId: plan.id,
              organizationId: input.organizationId,
            },
            trial_period_days: applyTrial ? TEAM_SUBSCRIPTION_TRIAL_DAYS : undefined,
          },
          payment_method_options: checkoutCardPaymentMethodOptions,
          allow_promotion_codes: true,
          return_url: `${new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin}/settings/team/checkout/{CHECKOUT_SESSION_ID}?organizationId=${input.organizationId}`,
        },
        customCheckoutRequestOptions,
      );

      await saveTeamBillingRecord(ctx.db, ctx.userId, input.organizationId, {
        stripeCustomerId: billingRecord.stripeCustomerId,
        planId: plan.id,
        priceId: price.id,
        status: "pending",
        mode: "subscription",
        checkoutSessionId: session.id,
      });

      if (!session.client_secret) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe did not return a checkout client secret.",
        });
      }

      return { sessionId: session.id, clientSecret: session.client_secret };
    }),
  getTeamCheckoutSession: billingEnabledProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        sessionId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      await verifyOrgOwner(ctx, input.organizationId);

      const session = await stripe.checkout.sessions.retrieve(
        input.sessionId,
        { expand: [...checkoutSessionExpand] },
        customCheckoutRequestOptions,
      );

      if (session.client_reference_id && session.client_reference_id !== ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Session does not belong to the current user.",
        });
      }

      if (session.metadata?.organizationId !== input.organizationId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Session does not belong to the selected organization.",
        });
      }

      return summarizeCheckoutSession(session);
    }),

  createTeamPortalSession: billingEnabledProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await verifyOrgOwner(ctx, input.organizationId);
      const subscription = await syncTeamSubscription(ctx, ctx.userId, input.organizationId);

      const portal = await createBillingPortalSession(
        subscription.stripeCustomerId,
        "/settings/team",
      );

      return { url: portal.url };
    }),

  changeTeamPlan: billingEnabledProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        planId: teamPlanIdSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyOrgOwner(ctx, input.organizationId);

      const plan = findPlanById(input.planId);
      if (!plan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target plan must be a team subscription plan.",
        });
      }

      const [price, subscriptionState] = await Promise.all([
        getPriceForPlan(plan),
        syncTeamSubscription(ctx, ctx.userId, input.organizationId),
      ]);
      if (!subscriptionState.stripeSubscriptionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active team subscription found.",
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

      const memberCount = await getOrgMemberCount(input.organizationId);
      const updated = await stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: price.id, quantity: memberCount }],
        metadata: {
          userId: ctx.userId,
          planId: plan.id,
          organizationId: input.organizationId,
        },
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
      });

      const updates: Partial<BillingRecord> = {
        planId: plan.id,
        priceId: price.id,
        mode: "subscription",
        status: updated.cancel_at_period_end ? "canceled" : updated.status,
        currentPeriodEnd: getSubscriptionPeriodEndDate(updated),
        stripeSubscriptionId: updated.id,
      };

      const saved = await saveTeamBillingRecord(ctx.db, ctx.userId, input.organizationId, {
        ...updates,
        stripeCustomerId: subscriptionState.stripeCustomerId,
      });

      if (saved?.maxModeEnabled) {
        await attachMaxModeMeteredItems(saved, ctx.userId);
      }

      if (subscriptionState.planId && subscriptionState.planId !== plan.id) {
        await recordTeamUsageAuditLog({
          ctx,
          organizationId: input.organizationId,
          action: "plan_changed",
          metadata: {
            previous: { planId: subscriptionState.planId },
            next: { planId: plan.id },
          },
        });
      }

      return {
        planId: saved.planId ?? null,
        status: saved.status ?? null,
        currentPeriodEnd: saved.currentPeriodEnd ?? null,
      };
    }),

  cancelTeamSubscription: billingEnabledProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await verifyOrgOwnerOrAdmin(ctx, input.organizationId);

      const subscriptionState = await syncTeamSubscription(ctx, ctx.userId, input.organizationId);
      if (!subscriptionState.stripeSubscriptionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active team subscription to cancel.",
        });
      }

      const canceled = await stripe.subscriptions.update(subscriptionState.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      const updates: Partial<BillingRecord> = {
        status: canceled.cancel_at_period_end ? "canceled" : canceled.status,
        cancelAt: canceled.cancel_at ?? null,
        currentPeriodEnd:
          getSubscriptionPeriodEndDate(canceled) ?? subscriptionState.currentPeriodEnd,
      };

      const saved = await saveTeamBillingRecord(ctx.db, ctx.userId, input.organizationId, {
        stripeSubscriptionId: subscriptionState.stripeSubscriptionId,
        ...updates,
        stripeCustomerId: subscriptionState.stripeCustomerId,
      });

      await recordTeamUsageAuditLog({
        ctx,
        organizationId: input.organizationId,
        action: "subscription_canceled",
        metadata: { planId: saved.planId, cancelAt: saved.cancelAt },
      });

      return {
        planId: saved.planId ?? null,
        status: saved.status ?? null,
        cancelAt: saved.cancelAt ?? null,
        currentPeriodEnd: saved.currentPeriodEnd ?? null,
      };
    }),

  resumeTeamSubscription: billingEnabledProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await verifyOrgOwnerOrAdmin(ctx, input.organizationId);

      const subscriptionState = await syncTeamSubscription(ctx, ctx.userId, input.organizationId);
      if (!subscriptionState.stripeSubscriptionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No team subscription to resume.",
        });
      }

      const resumed = await stripe.subscriptions.update(subscriptionState.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      const price = getLicensedPrice(resumed) ?? resumed.items.data.at(0)?.price ?? null;
      const plan =
        billingPlans.find((p) => p.lookupKey === price?.lookup_key) ??
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

      const saved = await saveTeamBillingRecord(ctx.db, ctx.userId, input.organizationId, {
        ...updates,
        stripeCustomerId: subscriptionState.stripeCustomerId,
      });

      await recordTeamUsageAuditLog({
        ctx,
        organizationId: input.organizationId,
        action: "subscription_resumed",
        metadata: { planId: saved.planId },
      });

      return {
        planId: saved.planId ?? null,
        status: saved.status ?? null,
        currentPeriodEnd: saved.currentPeriodEnd ?? null,
      };
    }),

  syncSeatCount: billingEnabledProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await verifyOrgOwner(ctx, input.organizationId);
      await updateTeamSeatCount(input.organizationId);
      const memberCount = await getOrgMemberCount(input.organizationId);
      await recordTeamUsageAuditLog({
        ctx,
        organizationId: input.organizationId,
        action: "seats_synced",
        metadata: { memberCount },
      });
      return { success: true };
    }),
});
