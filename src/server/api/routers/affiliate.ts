import { cookies, headers } from "next/headers";
import { TRPCError } from "@trpc/server";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { affiliateReferral, affiliateReward, user } from "@/db/schema";
import {
  sendAffiliateDiscountCouponEmail,
  sendAffiliatePlusCouponEmail,
  sendAffiliateResetRewardEmail,
} from "@/lib/affiliate-email";
import {
  AFFILIATE_DISCOUNT_PERCENT,
  AFFILIATE_RESET_PLAN_TIERS,
  AFFILIATE_REWARD_PREFERENCES,
} from "@/lib/affiliate-types";
import {
  AFFILIATE_COOKIE_NAME,
  AFFILIATE_REWARD_TYPES,
  approveAffiliateResetReward,
  claimAffiliateReferral,
  completeAffiliateCouponSend,
  getAffiliateCouponRecipient,
  getAffiliateResetRewardRecipient,
  getAffiliateStatus,
  grantAffiliateResetCredits,
  isAffiliateAdmin,
  markAffiliateCouponSending,
  rejectAffiliateResetReward,
  resetAffiliateCouponSending,
  setAffiliateRewardPreference,
  consumeAffiliateResetCredit,
} from "@/lib/affiliate";
import { resolveClientIp } from "@/lib/client-ip";
import { protectedProcedure, router } from "../trpc";
import { isVerifiedAdmin, type AdminUser } from "@/lib/verified-admin";

const referredUser = alias(user, "affiliate_admin_referred_user");
const affiliateRewardPreferenceSchema = z.enum([
  AFFILIATE_REWARD_PREFERENCES.resetCredits,
  AFFILIATE_REWARD_PREFERENCES.discountCoupon,
]);
const affiliateResetPlanTierSchema = z.enum(AFFILIATE_RESET_PLAN_TIERS);
const affiliateResetGrantTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("plan"), planTier: affiliateResetPlanTierSchema }),
  z.object({ type: z.literal("user"), identifier: z.string().trim().min(1).max(320) }),
]);

function getAdminEmail(ctx: { session: { user?: AdminUser } | null }) {
  const email = ctx.session?.user?.email;
  if (!isVerifiedAdmin(ctx.session?.user, isAffiliateAdmin)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Affiliate administration access is not configured for this account.",
    });
  }

  return email as string;
}

async function notifyAffiliateResetRewardEmail({
  rewardId,
  status,
}: {
  rewardId: string;
  status: "approved" | "rejected";
}) {
  try {
    const recipient = await getAffiliateResetRewardRecipient(rewardId);

    if (!recipient) {
      console.warn(`[affiliate] Reset reward recipient not found: ${rewardId}`);
      return false;
    }

    await sendAffiliateResetRewardEmail({
      to: recipient.email,
      name: recipient.name,
      quantity: recipient.quantity,
      status,
    });

    return true;
  } catch (error) {
    console.error(`[affiliate] Failed to send ${status} reset reward email:`, error);
    return false;
  }
}

export const affiliateRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const status = await getAffiliateStatus(ctx.userId);
    return { ...status, isAdmin: isVerifiedAdmin(ctx.session?.user, isAffiliateAdmin) };
  }),

  setRewardPreference: protectedProcedure
    .input(z.object({ preference: affiliateRewardPreferenceSchema }))
    .mutation(async ({ ctx, input }) => {
      const rewardPreference = await setAffiliateRewardPreference({
        userId: ctx.userId,
        preference: input.preference,
      });

      return { rewardPreference };
    }),

  claim: protectedProcedure
    .input(z.object({ code: z.string().trim().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const cookieStore = await cookies();
      const code = input?.code ?? cookieStore.get(AFFILIATE_COOKIE_NAME)?.value;

      if (!code) {
        return { created: false, alreadyClaimed: false, noCode: true };
      }

      try {
        const claimIp = resolveClientIp(await headers()) ?? null;
        const result = await claimAffiliateReferral({ userId: ctx.userId, code, claimIp });
        cookieStore.delete(AFFILIATE_COOKIE_NAME);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Unable to apply referral code.",
        });
      }
    }),

  consumeResetCredit: protectedProcedure.mutation(async ({ ctx }) => {
    const remaining = await consumeAffiliateResetCredit(ctx.userId);
    if (remaining === null) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No rate-limit reset credits are available.",
      });
    }

    return { remaining };
  }),

  adminGrantResetCredits: protectedProcedure
    .input(
      z.object({
        target: affiliateResetGrantTargetSchema,
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminEmail = getAdminEmail(ctx);
      const result = await grantAffiliateResetCredits({
        target: input.target,
        quantity: input.quantity,
        adminEmail,
      });

      if (result.matchedUsers === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No users matched the selected reset target.",
        });
      }

      return result;
    }),

  adminOverview: protectedProcedure.query(async ({ ctx }) => {
    getAdminEmail(ctx);

    const rows = await ctx.db
      .select({
        reward: affiliateReward,
        referrer: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        referral: {
          id: affiliateReferral.id,
          registeredAt: affiliateReferral.registeredAt,
          purchaseDeadlineAt: affiliateReferral.purchaseDeadlineAt,
          purchasePlanId: affiliateReferral.purchasePlanId,
        },
        referredUser: {
          id: referredUser.id,
          name: referredUser.name,
          email: referredUser.email,
        },
      })
      .from(affiliateReward)
      .innerJoin(user, eq(affiliateReward.referrerId, user.id))
      .leftJoin(affiliateReferral, eq(affiliateReward.referralId, affiliateReferral.id))
      .leftJoin(referredUser, eq(affiliateReferral.referredUserId, referredUser.id))
      .where(inArray(affiliateReward.status, ["pending", "pending_email", "sending"]))
      .orderBy(desc(affiliateReward.createdAt));

    return rows;
  }),

  approveResetReward: protectedProcedure
    .input(z.object({ rewardId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const adminEmail = getAdminEmail(ctx);
      const approved = await approveAffiliateResetReward({
        rewardId: input.rewardId,
        adminEmail,
      });

      if (!approved) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This reset reward is no longer pending.",
        });
      }

      const emailSent = await notifyAffiliateResetRewardEmail({
        rewardId: approved.id,
        status: "approved",
      });

      return { ...approved, emailSent };
    }),

  rejectResetReward: protectedProcedure
    .input(z.object({ rewardId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const adminEmail = getAdminEmail(ctx);
      const rejected = await rejectAffiliateResetReward({
        rewardId: input.rewardId,
        adminEmail,
      });

      if (!rejected) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This reset reward is no longer pending.",
        });
      }

      const emailSent = await notifyAffiliateResetRewardEmail({
        rewardId: rejected.id,
        status: "rejected",
      });

      return { ...rejected, emailSent };
    }),

  sendCouponEmail: protectedProcedure
    .input(
      z.object({
        rewardId: z.string().min(1),
        couponCode: z.string().trim().min(1).max(200),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminEmail = getAdminEmail(ctx);
      const marked = await markAffiliateCouponSending(input.rewardId);
      if (!marked) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This coupon reward is already being processed or was already sent.",
        });
      }

      try {
        const recipient = await getAffiliateCouponRecipient(input.rewardId);

        if (!recipient) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Coupon reward recipient not found.",
          });
        }

        if (recipient.type === AFFILIATE_REWARD_TYPES.discountCoupon) {
          await sendAffiliateDiscountCouponEmail({
            to: recipient.email,
            name: recipient.name,
            couponCode: input.couponCode,
            note: input.note || null,
          });
        } else {
          await sendAffiliatePlusCouponEmail({
            to: recipient.email,
            name: recipient.name,
            couponCode: input.couponCode,
            note: input.note || null,
          });
        }

        const sent = await completeAffiliateCouponSend({
          rewardId: input.rewardId,
          adminEmail,
          couponCode: input.couponCode,
          note: input.note || null,
        });

        if (!sent) {
          throw new Error("Coupon email was sent, but the reward could not be recorded.");
        }

        return {
          sent: true,
          email: recipient.email,
          discountPercent:
            recipient.type === AFFILIATE_REWARD_TYPES.discountCoupon
              ? AFFILIATE_DISCOUNT_PERCENT
              : null,
        };
      } catch (error) {
        await resetAffiliateCouponSending(input.rewardId);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Unable to send coupon email.",
        });
      }
    }),
});

export type AffiliateRouter = typeof affiliateRouter;
