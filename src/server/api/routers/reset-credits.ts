import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin-emails";
import {
  consumeResetCredit,
  getResetCreditBalance,
  grantResetCredits,
  RESET_CREDIT_PLAN_TIERS,
} from "@/lib/reset-credits";
import { isVerifiedAdmin, type AdminUser } from "@/lib/verified-admin";
import { protectedProcedure, router } from "../trpc";

const resetGrantTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("plan"), planTier: z.enum(RESET_CREDIT_PLAN_TIERS) }),
  z.object({ type: z.literal("user"), identifier: z.string().trim().min(1).max(320) }),
]);

function getAdminEmail(ctx: { session: { user?: AdminUser } | null }) {
  const email = ctx.session?.user?.email;
  if (!isVerifiedAdmin(ctx.session?.user, isAdminEmail)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Reset credit administration is not configured for this account.",
    });
  }

  return email as string;
}

export const resetCreditsRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => ({
    resetCredits: await getResetCreditBalance(ctx.userId),
    isAdmin: isVerifiedAdmin(ctx.session?.user, isAdminEmail),
  })),

  consume: protectedProcedure.mutation(async ({ ctx }) => {
    const remaining = await consumeResetCredit(ctx.userId);
    if (remaining === null) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No rate-limit reset credits are available.",
      });
    }

    return { remaining };
  }),

  adminGrant: protectedProcedure
    .input(
      z.object({
        target: resetGrantTargetSchema,
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminEmail = getAdminEmail(ctx);
      const result = await grantResetCredits({
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
});
