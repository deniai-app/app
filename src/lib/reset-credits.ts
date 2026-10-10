import { and, eq, gt, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { billing, member, resetCreditBalance, usageQuota, user } from "@/db/schema";

export const RESET_CREDIT_PLAN_TIERS = ["free", "plus", "pro", "max"] as const;
export type ResetCreditPlanTier = (typeof RESET_CREDIT_PLAN_TIERS)[number];

export type ResetCreditGrantTarget =
  | { type: "all" }
  | { type: "plan"; planTier: ResetCreditPlanTier }
  | { type: "user"; identifier: string };

const ACTIVE_RESET_BILLING_STATUSES = ["active", "trialing", "past_due", "paid"] as const;
const RESET_GRANT_BATCH_SIZE = 500;

function getPaidPlanCondition(planTier?: Exclude<ResetCreditPlanTier, "free">) {
  if (!planTier) {
    return or(
      like(billing.planId, "plus_%"),
      like(billing.planId, "pro_%"),
      like(billing.planId, "max_%"),
    );
  }

  return like(billing.planId, `${planTier}_%`);
}

function getActiveBillingCondition(now: Date) {
  return or(
    inArray(billing.status, ACTIVE_RESET_BILLING_STATUSES),
    and(eq(billing.status, "canceled"), gt(billing.currentPeriodEnd, now)),
  );
}

function getPermanentUserCondition() {
  return or(eq(user.isAnonymous, false), isNull(user.isAnonymous));
}

async function getPaidResetTargetUserIds(
  planTier?: Exclude<ResetCreditPlanTier, "free">,
): Promise<string[]> {
  const activeBillingCondition = getActiveBillingCondition(new Date());
  const planCondition = getPaidPlanCondition(planTier);
  const [personalRows, teamRows] = await Promise.all([
    db
      .select({ userId: billing.userId })
      .from(billing)
      .innerJoin(user, eq(billing.userId, user.id))
      .where(
        and(
          getPermanentUserCondition(),
          isNull(billing.organizationId),
          activeBillingCondition,
          planCondition,
        ),
      ),
    db
      .select({ userId: member.userId, planId: billing.planId })
      .from(member)
      .innerJoin(billing, eq(member.organizationId, billing.organizationId))
      .innerJoin(user, eq(member.userId, user.id))
      .where(
        and(
          getPermanentUserCondition(),
          isNotNull(billing.organizationId),
          activeBillingCondition,
          or(like(billing.planId, "pro_team%"), like(billing.planId, "max_team%")),
        ),
      ),
  ]);

  const activeTeamUserIds = new Set(teamRows.map((row) => row.userId));
  const selectedTeamUserIds = teamRows
    .filter((row) => !planTier || (row.planId != null && row.planId.startsWith(`${planTier}_team`)))
    .map((row) => row.userId);
  const selectedPersonalUserIds = personalRows
    .map((row) => row.userId)
    .filter((userId) => !activeTeamUserIds.has(userId));

  return [...new Set([...selectedTeamUserIds, ...selectedPersonalUserIds])];
}

async function getResetGrantTargetUserIds(target: ResetCreditGrantTarget) {
  const permanentUserCondition = getPermanentUserCondition();

  if (target.type === "user") {
    const identifier = target.identifier.trim();
    const rows = await db
      .select({ userId: user.id })
      .from(user)
      .where(
        and(
          permanentUserCondition,
          or(eq(user.id, identifier), sql`lower(${user.email}) = ${identifier.toLowerCase()}`),
        ),
      )
      .limit(1);
    return rows.map((row) => row.userId);
  }

  if (target.type === "all") {
    const rows = await db.select({ userId: user.id }).from(user).where(permanentUserCondition);
    return rows.map((row) => row.userId);
  }

  if (!RESET_CREDIT_PLAN_TIERS.includes(target.planTier)) {
    throw new Error("Unknown reset target plan.");
  }

  if (target.planTier !== "free") {
    return getPaidResetTargetUserIds(target.planTier);
  }

  const [allUserRows, paidUserIds] = await Promise.all([
    db.select({ userId: user.id }).from(user).where(permanentUserCondition),
    getPaidResetTargetUserIds(),
  ]);
  const paidUsers = new Set(paidUserIds);
  return allUserRows.map((row) => row.userId).filter((userId) => !paidUsers.has(userId));
}

export async function getResetCreditBalance(userId: string) {
  const [row] = await db
    .select({ credits: resetCreditBalance.credits })
    .from(resetCreditBalance)
    .where(eq(resetCreditBalance.userId, userId))
    .limit(1);

  return row?.credits ?? 0;
}

export async function grantResetCredits({
  target,
  quantity,
  adminEmail,
}: {
  target: ResetCreditGrantTarget;
  quantity: number;
  adminEmail: string;
}) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new Error("Reset credit quantity must be between 1 and 100.");
  }

  const userIds = await getResetGrantTargetUserIds(target);
  if (userIds.length === 0) {
    return { matchedUsers: 0, grantedUsers: 0, quantity };
  }

  let grantedUsers = 0;
  for (let index = 0; index < userIds.length; index += RESET_GRANT_BATCH_SIZE) {
    const batch = userIds.slice(index, index + RESET_GRANT_BATCH_SIZE);
    const granted = await db
      .insert(resetCreditBalance)
      .values(batch.map((userId) => ({ userId, credits: quantity })))
      .onConflictDoUpdate({
        target: resetCreditBalance.userId,
        set: {
          credits: sql`${resetCreditBalance.credits} + ${quantity}`,
          updatedAt: new Date(),
        },
      })
      .returning({ userId: resetCreditBalance.userId });
    grantedUsers += granted.length;
  }

  console.info("[reset-credits] Admin reset credits granted", {
    adminEmail,
    target,
    quantity,
    matchedUsers: userIds.length,
    grantedUsers,
  });

  return { matchedUsers: userIds.length, grantedUsers, quantity };
}

export async function consumeResetCredit(userId: string) {
  const now = new Date();
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
      const [balance] = await tx
        .update(resetCreditBalance)
        .set({ credits: sql`${resetCreditBalance.credits} - 1`, updatedAt: now })
        .where(and(eq(resetCreditBalance.userId, userId), sql`${resetCreditBalance.credits} > 0`))
        .returning({ credits: resetCreditBalance.credits });

      if (!balance) {
        return null;
      }

      await tx
        .update(usageQuota)
        .set({ used: 0, periodStart: now, updatedAt: now })
        .where(eq(usageQuota.userId, userId));

      // A quota reward does not erase incurred charges or a whole team's ledger.
      return balance.credits;
    },
    { isolationLevel: "read committed" },
  );
}
