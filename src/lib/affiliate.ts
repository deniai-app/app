import { and, desc, eq, gt, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/db/drizzle";
import {
  affiliateProfile,
  affiliateReferral,
  affiliateReward,
  billing,
  member,
  usageQuota,
  user,
} from "@/db/schema";
import { env } from "@/env";
import { evaluateRegistrationReward, hashClaimIp } from "@/lib/affiliate-risk";
import {
  AFFILIATE_RESET_PLAN_TIERS,
  AFFILIATE_REWARD_PREFERENCES,
  AFFILIATE_REWARD_TYPES,
  type AffiliateResetPlanTier,
  type AffiliateRewardPreference,
} from "@/lib/affiliate-types";

export { AFFILIATE_REWARD_TYPES };

export const AFFILIATE_COOKIE_NAME = "deni-ai-affiliate-code";
export const AFFILIATE_REGISTRATION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const AFFILIATE_PURCHASE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const AFFILIATE_REFERRAL_MILESTONE = 3;

const affiliateCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const createAffiliateCode = customAlphabet(affiliateCodeAlphabet, 10);

const AFFILIATE_PURCHASE_PLAN_IDS = new Set([
  "plus_monthly",
  "plus_yearly",
  "pro_monthly",
  "pro_yearly",
  "pro_lifetime",
  "max_monthly",
  "max_yearly",
]);

const ACTIVE_RESET_BILLING_STATUSES = ["active", "trialing", "past_due", "paid"] as const;
const RESET_PROFILE_BATCH_SIZE = 500;

export type AffiliateResetGrantTarget =
  | { type: "all" }
  | { type: "plan"; planTier: AffiliateResetPlanTier }
  | { type: "user"; identifier: string };

export function normalizeAffiliateCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{10}$/.test(normalized) ? normalized : null;
}

export function isAffiliatePurchasePlan(planId: string | null | undefined): boolean {
  return Boolean(planId && AFFILIATE_PURCHASE_PLAN_IDS.has(planId));
}

export function isAffiliateRewardPreference(
  value: string | null | undefined,
): value is AffiliateRewardPreference {
  return (
    value === AFFILIATE_REWARD_PREFERENCES.resetCredits ||
    value === AFFILIATE_REWARD_PREFERENCES.discountCoupon
  );
}

export function isAffiliatePaidStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "paid";
}

export function buildAffiliateReferralUrl(code: string) {
  return new URL(`/invite/${encodeURIComponent(code)}`, env.NEXT_PUBLIC_BETTER_AUTH_URL).toString();
}

export function isWithinAffiliateWindow(date: Date, start: Date, durationMs: number) {
  const time = date.getTime();
  return time >= start.getTime() && time <= start.getTime() + durationMs;
}

export function getAffiliateAdminEmails() {
  return new Set(
    (env.AFFILIATE_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAffiliateAdmin(email: string | null | undefined) {
  return Boolean(email && getAffiliateAdminEmails().has(email.trim().toLowerCase()));
}

function getPaidPlanCondition(planTier?: Exclude<AffiliateResetPlanTier, "free">) {
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
  planTier?: Exclude<AffiliateResetPlanTier, "free">,
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

async function getResetGrantTargetUserIds(target: AffiliateResetGrantTarget) {
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

  if (!AFFILIATE_RESET_PLAN_TIERS.includes(target.planTier)) {
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

async function ensureAffiliateProfilesForUsers(userIds: string[]) {
  for (let index = 0; index < userIds.length; index += RESET_PROFILE_BATCH_SIZE) {
    const batch = userIds.slice(index, index + RESET_PROFILE_BATCH_SIZE);
    await db
      .insert(affiliateProfile)
      .values(batch.map((userId) => ({ userId, code: createAffiliateCode() })))
      .onConflictDoNothing();
  }
}

export async function grantAffiliateResetCredits({
  target,
  quantity,
  adminEmail,
}: {
  target: AffiliateResetGrantTarget;
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

  await ensureAffiliateProfilesForUsers(userIds);

  let grantedUsers = 0;
  for (let index = 0; index < userIds.length; index += RESET_PROFILE_BATCH_SIZE) {
    const batch = userIds.slice(index, index + RESET_PROFILE_BATCH_SIZE);
    const updated = await db
      .update(affiliateProfile)
      .set({
        resetCredits: sql`${affiliateProfile.resetCredits} + ${quantity}`,
        updatedAt: new Date(),
      })
      .where(inArray(affiliateProfile.userId, batch))
      .returning({ userId: affiliateProfile.userId });
    grantedUsers += updated.length;
  }

  console.info("[affiliate] Admin reset credits granted", {
    adminEmail,
    target,
    quantity,
    matchedUsers: userIds.length,
    grantedUsers,
  });

  return { matchedUsers: userIds.length, grantedUsers, quantity };
}

export async function ensureAffiliateProfile(userId: string) {
  const [existing] = await db
    .select()
    .from(affiliateProfile)
    .where(eq(affiliateProfile.userId, userId))
    .limit(1);

  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [created] = await db
      .insert(affiliateProfile)
      .values({ userId, code: createAffiliateCode() })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return created;
    }
  }

  const [profile] = await db
    .select()
    .from(affiliateProfile)
    .where(eq(affiliateProfile.userId, userId))
    .limit(1);

  if (!profile) {
    throw new Error("Unable to create an affiliate profile.");
  }

  return profile;
}

export async function getAffiliateStatus(userId: string) {
  const profilePromise = ensureAffiliateProfile(userId);
  const referralCountPromise = db
    .select({ count: sql<number>`count(*)::int` })
    .from(affiliateReferral)
    .where(eq(affiliateReferral.referrerId, userId));

  const [profile, referralCountResult] = await Promise.all([profilePromise, referralCountPromise]);
  const referredUser = user;

  const [referrals, rewards] = await Promise.all([
    db
      .select({
        id: affiliateReferral.id,
        referredUserId: affiliateReferral.referredUserId,
        referredName: referredUser.name,
        registeredAt: affiliateReferral.registeredAt,
        purchaseDeadlineAt: affiliateReferral.purchaseDeadlineAt,
        purchasePlanId: affiliateReferral.purchasePlanId,
        purchaseAt: affiliateReferral.purchaseAt,
      })
      .from(affiliateReferral)
      .innerJoin(referredUser, eq(affiliateReferral.referredUserId, referredUser.id))
      .where(eq(affiliateReferral.referrerId, userId))
      .orderBy(desc(affiliateReferral.registeredAt)),
    db
      .select({
        id: affiliateReward.id,
        type: affiliateReward.type,
        quantity: affiliateReward.quantity,
        milestone: affiliateReward.milestone,
        status: affiliateReward.status,
        planId: affiliateReward.planId,
        couponCode: affiliateReward.couponCode,
        note: affiliateReward.note,
        createdAt: affiliateReward.createdAt,
        approvedAt: affiliateReward.approvedAt,
        sentAt: affiliateReward.sentAt,
      })
      .from(affiliateReward)
      .where(eq(affiliateReward.referrerId, userId))
      .orderBy(desc(affiliateReward.createdAt)),
  ]);

  const referralCount = referralCountResult[0]?.count ?? 0;

  return {
    code: profile.code,
    referralUrl: buildAffiliateReferralUrl(profile.code),
    referralCount,
    referralsUntilNextReward:
      AFFILIATE_REFERRAL_MILESTONE - (referralCount % AFFILIATE_REFERRAL_MILESTONE),
    resetCredits: profile.resetCredits,
    rewardPreference: isAffiliateRewardPreference(profile.rewardPreference)
      ? profile.rewardPreference
      : AFFILIATE_REWARD_PREFERENCES.resetCredits,
    referrals,
    rewards,
  };
}

export async function setAffiliateRewardPreference({
  userId,
  preference,
}: {
  userId: string;
  preference: AffiliateRewardPreference;
}) {
  await ensureAffiliateProfile(userId);

  const [updated] = await db
    .update(affiliateProfile)
    .set({ rewardPreference: preference, updatedAt: new Date() })
    .where(eq(affiliateProfile.userId, userId))
    .returning({ rewardPreference: affiliateProfile.rewardPreference });

  if (!updated || !isAffiliateRewardPreference(updated.rewardPreference)) {
    throw new Error("Unable to save affiliate reward preference.");
  }

  return updated.rewardPreference;
}

export async function claimAffiliateReferral({
  userId,
  code,
  claimIp = null,
}: {
  userId: string;
  code: string;
  claimIp?: string | null;
}) {
  const normalizedCode = normalizeAffiliateCode(code);
  if (!normalizedCode) {
    throw new Error("Enter a valid referral code.");
  }

  const [referredUser, referrerProfile] = await Promise.all([
    db
      .select({
        id: user.id,
        createdAt: user.createdAt,
        isAnonymous: user.isAnonymous,
        email: user.email,
        emailVerified: user.emailVerified,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ userId: affiliateProfile.userId })
      .from(affiliateProfile)
      .where(eq(affiliateProfile.code, normalizedCode))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  if (!referredUser || referredUser.isAnonymous) {
    throw new Error("A permanent account is required to use a referral code.");
  }

  if (!referrerProfile) {
    throw new Error("Referral code not found.");
  }

  if (referrerProfile.userId === userId) {
    throw new Error("You cannot use your own referral code.");
  }

  if (
    !isWithinAffiliateWindow(new Date(), referredUser.createdAt, AFFILIATE_REGISTRATION_WINDOW_MS)
  ) {
    throw new Error("Referral codes can only be applied within 24 hours of registration.");
  }

  const [existingReferral] = await db
    .select()
    .from(affiliateReferral)
    .where(eq(affiliateReferral.referredUserId, userId))
    .limit(1);

  if (existingReferral) {
    if (existingReferral.referrerId === referrerProfile.userId) {
      return { created: false, alreadyClaimed: true, referrerId: existingReferral.referrerId };
    }

    throw new Error("This account already has a referral attribution.");
  }

  const registeredAt = referredUser.createdAt;
  const purchaseDeadlineAt = new Date(registeredAt.getTime() + AFFILIATE_PURCHASE_WINDOW_MS);
  const claimedAt = new Date();
  const claimIpHash = hashClaimIp(claimIp);
  const [createdReferral] = await db
    .insert(affiliateReferral)
    .values({
      referrerId: referrerProfile.userId,
      referredUserId: userId,
      code: normalizedCode,
      registeredAt,
      purchaseDeadlineAt,
      claimIpHash,
    })
    .onConflictDoNothing({ target: affiliateReferral.referredUserId })
    .returning();

  if (!createdReferral) {
    return { created: false, alreadyClaimed: true, referrerId: referrerProfile.userId };
  }

  const referralCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(affiliateReferral)
    .where(eq(affiliateReferral.referrerId, referrerProfile.userId));
  const referralCount = referralCountResult[0]?.count ?? 0;
  const milestone = Math.floor(referralCount / AFFILIATE_REFERRAL_MILESTONE);

  // Use the current milestone rather than relying on an exact count modulo.
  // This also recovers if concurrent registrations make the count jump from
  // 2 to 4 before the third registration finishes its reward insert.
  if (milestone > 0) {
    // Trust-tiered staged approval: a referrer only starts earning
    // auto-approved rewards after a clean track record, and even then only
    // when this specific referral's fraud signals are clean. New referrers,
    // any referrer with a past rejection, or a referral with a hard-block
    // signal (e.g. same IP already used for this referrer) always land in
    // the manual review queue — see src/lib/affiliate-risk.ts.
    const { autoApprove, risk } = await evaluateRegistrationReward({
      referrerId: referrerProfile.userId,
      referredUserId: userId,
      referredEmail: referredUser.email,
      referredEmailVerified: referredUser.emailVerified,
      referredCreatedAt: referredUser.createdAt,
      claimedAt,
      claimIpHash,
    });

    // One transaction: if the credit update failed after the reward row was
    // inserted, a retry would see the existing row and never grant the credit.
    await db.transaction(async (tx) => {
      const [insertedReward] = await tx
        .insert(affiliateReward)
        .values({
          referrerId: referrerProfile.userId,
          referralId: createdReferral.id,
          type: AFFILIATE_REWARD_TYPES.registrationReset,
          quantity: 1,
          milestone,
          status: autoApprove ? "approved" : "pending",
          riskScore: risk.score,
          riskFlags: risk.flags,
          ...(autoApprove ? { approvedBy: "system:auto", approvedAt: claimedAt } : {}),
        })
        .onConflictDoNothing()
        .returning({ id: affiliateReward.id, quantity: affiliateReward.quantity });

      if (insertedReward && autoApprove) {
        await tx
          .update(affiliateProfile)
          .set({
            resetCredits: sql`${affiliateProfile.resetCredits} + ${insertedReward.quantity}`,
            updatedAt: claimedAt,
          })
          .where(eq(affiliateProfile.userId, referrerProfile.userId));
      }
    });
  }

  // A user can apply a code after paying, as long as both windows still allow it.
  const [personalBilling] = await db
    .select({ planId: billing.planId, status: billing.status, firstPaidAt: billing.firstPaidAt })
    .from(billing)
    .where(and(eq(billing.userId, userId), isNull(billing.organizationId)))
    .limit(1);

  if (
    personalBilling?.planId &&
    personalBilling.firstPaidAt &&
    isAffiliatePaidStatus(personalBilling.status)
  ) {
    await processAffiliatePurchase({
      referredUserId: userId,
      planId: personalBilling.planId,
      purchasedAt: personalBilling.firstPaidAt,
    });
  }

  return { created: true, alreadyClaimed: false, referrerId: referrerProfile.userId };
}

export async function processAffiliatePurchase({
  referredUserId,
  planId,
  purchasedAt = new Date(),
}: {
  referredUserId: string;
  planId: string;
  purchasedAt?: Date;
}) {
  if (!isAffiliatePurchasePlan(planId)) {
    return { resetGranted: false, couponGranted: false };
  }

  const [referral] = await db
    .select()
    .from(affiliateReferral)
    .where(eq(affiliateReferral.referredUserId, referredUserId))
    .limit(1);

  if (
    !referral ||
    !isWithinAffiliateWindow(purchasedAt, referral.registeredAt, AFFILIATE_PURCHASE_WINDOW_MS)
  ) {
    return { resetGranted: false, couponGranted: false };
  }

  const [existingPurchaseReward] = await db
    .select({ type: affiliateReward.type })
    .from(affiliateReward)
    .where(
      and(
        eq(affiliateReward.referralId, referral.id),
        inArray(affiliateReward.type, [
          AFFILIATE_REWARD_TYPES.purchaseReset,
          AFFILIATE_REWARD_TYPES.plusCoupon,
          AFFILIATE_REWARD_TYPES.discountCoupon,
        ]),
      ),
    )
    .limit(1);

  if (existingPurchaseReward) {
    return {
      resetGranted: existingPurchaseReward.type === AFFILIATE_REWARD_TYPES.purchaseReset,
      couponGranted: existingPurchaseReward.type !== AFFILIATE_REWARD_TYPES.purchaseReset,
    };
  }

  const profile = await ensureAffiliateProfile(referral.referrerId);
  const rewardPreference = isAffiliateRewardPreference(profile.rewardPreference)
    ? profile.rewardPreference
    : AFFILIATE_REWARD_PREFERENCES.resetCredits;
  // The unique reward indexes make webhook retries idempotent.
  const [updatedReferral] = await db
    .update(affiliateReferral)
    .set({ purchasePlanId: planId, purchaseAt: purchasedAt, updatedAt: new Date() })
    .where(eq(affiliateReferral.id, referral.id))
    .returning({ id: affiliateReferral.id });

  if (!updatedReferral) {
    return { resetGranted: false, couponGranted: false };
  }

  if (rewardPreference === AFFILIATE_REWARD_PREFERENCES.discountCoupon) {
    const [couponReward] = await db
      .insert(affiliateReward)
      .values({
        referrerId: referral.referrerId,
        referralId: referral.id,
        type: AFFILIATE_REWARD_TYPES.discountCoupon,
        quantity: 1,
        status: "pending_email",
        planId,
      })
      .onConflictDoNothing()
      .returning({ id: affiliateReward.id });
    return {
      resetGranted: false,
      couponGranted: Boolean(couponReward),
      rewardPreference,
    };
  }

  // The reward row and its credits are written together, so a webhook retry
  // cannot find the row and skip credits that were never added.
  const resetReward = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(affiliateReward)
      .values({
        referrerId: referral.referrerId,
        referralId: referral.id,
        type: AFFILIATE_REWARD_TYPES.purchaseReset,
        quantity: 3,
        status: "approved",
        planId,
        approvedBy: "system",
        approvedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: affiliateReward.id });

    if (inserted) {
      await tx
        .update(affiliateProfile)
        .set({
          resetCredits: sql`${affiliateProfile.resetCredits} + 3`,
          updatedAt: new Date(),
        })
        .where(eq(affiliateProfile.id, profile.id));
    }
    return inserted;
  });

  return {
    resetGranted: Boolean(resetReward),
    couponGranted: false,
    rewardPreference,
  };
}

export async function approveAffiliateResetReward({
  rewardId,
  adminEmail,
}: {
  rewardId: string;
  adminEmail: string;
}) {
  const now = new Date();
  const [approved] = await db
    .update(affiliateReward)
    .set({ status: "approved", approvedBy: adminEmail, approvedAt: now, updatedAt: now })
    .where(
      and(
        eq(affiliateReward.id, rewardId),
        eq(affiliateReward.type, AFFILIATE_REWARD_TYPES.registrationReset),
        eq(affiliateReward.status, "pending"),
      ),
    )
    .returning();

  if (!approved) {
    return null;
  }

  await db
    .update(affiliateProfile)
    .set({
      resetCredits: sql`${affiliateProfile.resetCredits} + ${approved.quantity}`,
      updatedAt: now,
    })
    .where(eq(affiliateProfile.userId, approved.referrerId));

  return approved;
}

export async function rejectAffiliateResetReward({
  rewardId,
  adminEmail,
}: {
  rewardId: string;
  adminEmail: string;
}) {
  const [rejected] = await db
    .update(affiliateReward)
    .set({
      status: "rejected",
      approvedBy: adminEmail,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(affiliateReward.id, rewardId),
        eq(affiliateReward.type, AFFILIATE_REWARD_TYPES.registrationReset),
        eq(affiliateReward.status, "pending"),
      ),
    )
    .returning();

  return rejected ?? null;
}

export async function getAffiliateResetRewardRecipient(rewardId: string) {
  const [reward] = await db
    .select({
      quantity: affiliateReward.quantity,
      email: user.email,
      name: user.name,
    })
    .from(affiliateReward)
    .innerJoin(user, eq(affiliateReward.referrerId, user.id))
    .where(
      and(
        eq(affiliateReward.id, rewardId),
        eq(affiliateReward.type, AFFILIATE_REWARD_TYPES.registrationReset),
        inArray(affiliateReward.status, ["approved", "rejected"]),
      ),
    )
    .limit(1);

  return reward ?? null;
}

export async function getAffiliateCouponRecipient(rewardId: string) {
  const [reward] = await db
    .select({
      id: affiliateReward.id,
      status: affiliateReward.status,
      type: affiliateReward.type,
      email: user.email,
      name: user.name,
    })
    .from(affiliateReward)
    .innerJoin(user, eq(affiliateReward.referrerId, user.id))
    .where(
      and(
        eq(affiliateReward.id, rewardId),
        inArray(affiliateReward.type, [
          AFFILIATE_REWARD_TYPES.plusCoupon,
          AFFILIATE_REWARD_TYPES.discountCoupon,
        ]),
        inArray(affiliateReward.status, ["pending_email", "sending"]),
      ),
    )
    .limit(1);

  return reward ?? null;
}

export async function markAffiliateCouponSending(rewardId: string) {
  const [updated] = await db
    .update(affiliateReward)
    .set({ status: "sending", updatedAt: new Date() })
    .where(
      and(
        eq(affiliateReward.id, rewardId),
        inArray(affiliateReward.type, [
          AFFILIATE_REWARD_TYPES.plusCoupon,
          AFFILIATE_REWARD_TYPES.discountCoupon,
        ]),
        eq(affiliateReward.status, "pending_email"),
      ),
    )
    .returning({ id: affiliateReward.id });

  return updated ?? null;
}

export async function completeAffiliateCouponSend({
  rewardId,
  adminEmail,
  couponCode,
  note,
}: {
  rewardId: string;
  adminEmail: string;
  couponCode: string;
  note: string | null;
}) {
  const [updated] = await db
    .update(affiliateReward)
    .set({
      status: "sent",
      couponCode,
      note,
      sentBy: adminEmail,
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(affiliateReward.id, rewardId), eq(affiliateReward.status, "sending")))
    .returning();

  return updated ?? null;
}

export async function resetAffiliateCouponSending(rewardId: string) {
  await db
    .update(affiliateReward)
    .set({ status: "pending_email", updatedAt: new Date() })
    .where(and(eq(affiliateReward.id, rewardId), eq(affiliateReward.status, "sending")));
}

export async function consumeAffiliateResetCredit(userId: string) {
  const now = new Date();
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
      const [profile] = await tx
        .update(affiliateProfile)
        .set({ resetCredits: sql`${affiliateProfile.resetCredits} - 1`, updatedAt: now })
        .where(and(eq(affiliateProfile.userId, userId), sql`${affiliateProfile.resetCredits} > 0`))
        .returning({ resetCredits: affiliateProfile.resetCredits });

      if (!profile) {
        return null;
      }

      await tx
        .update(usageQuota)
        .set({ used: 0, periodStart: now, updatedAt: now })
        .where(eq(usageQuota.userId, userId));

      // A quota reward does not erase incurred charges or a whole team's ledger.
      return profile.resetCredits;
    },
    { isolationLevel: "read committed" },
  );
}
