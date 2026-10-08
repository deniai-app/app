import { createHmac } from "node:crypto";
import { isDisposableEmail } from "@deni-ai/disposable-email-domains";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { affiliateReferral, affiliateReward } from "@/db/schema";
import { env } from "@/env";
import { AFFILIATE_REWARD_TYPES } from "@/lib/affiliate-types";

/** The global pool or a transaction, so callers holding a lock never need a second connection. */
type RiskDatabase = Pick<typeof db, "select">;

const VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const VELOCITY_THRESHOLD = 5;
const FAST_CLAIM_MS = 10 * 60 * 1000;

/**
 * HMAC(secret, ip) — lets us detect "the same network claimed several codes
 * for this referrer" without ever storing a reversible IP address.
 */
export function hashClaimIp(ip: string | null): string | null {
  if (!ip || ip === "unknown") {
    return null;
  }
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(ip).digest("hex");
}

export type RegistrationRewardRisk = {
  score: number;
  flags: string[];
  /** Signals strong enough to force manual review regardless of trust tier. */
  hardBlock: boolean;
};

export async function computeRegistrationRewardRisk(
  {
    referrerId,
    referredUserId,
    referredEmail,
    referredEmailVerified,
    referredCreatedAt,
    claimedAt,
    claimIpHash,
  }: {
    referrerId: string;
    referredUserId: string;
    referredEmail: string;
    referredEmailVerified: boolean;
    referredCreatedAt: Date;
    claimedAt: Date;
    claimIpHash: string | null;
  },
  database: RiskDatabase = db,
): Promise<RegistrationRewardRisk> {
  const flags: string[] = [];
  let score = 0;
  let hardBlock = false;

  if (isDisposableEmail(referredEmail)) {
    score += 50;
    flags.push("disposable_email");
  }

  if (!referredEmailVerified) {
    score += 15;
    flags.push("email_unverified");
  }

  if (claimedAt.getTime() - referredCreatedAt.getTime() <= FAST_CLAIM_MS) {
    score += 10;
    flags.push("fast_claim");
  }

  if (claimIpHash) {
    const [ipCollision] = await database
      .select({ id: affiliateReferral.id })
      .from(affiliateReferral)
      .where(
        and(
          eq(affiliateReferral.referrerId, referrerId),
          eq(affiliateReferral.claimIpHash, claimIpHash),
          ne(affiliateReferral.referredUserId, referredUserId),
        ),
      )
      .limit(1);

    if (ipCollision) {
      score += 50;
      flags.push("ip_reused_for_referrer");
      hardBlock = true;
    }
  }

  const since = new Date(claimedAt.getTime() - VELOCITY_WINDOW_MS);
  const [velocity] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(affiliateReferral)
    .where(
      and(eq(affiliateReferral.referrerId, referrerId), gte(affiliateReferral.registeredAt, since)),
    );

  if ((velocity?.count ?? 0) >= VELOCITY_THRESHOLD) {
    score += 25;
    flags.push("high_velocity");
  }

  return { score: Math.min(score, 100), flags, hardBlock };
}

export type ReferrerTrustTier = "new" | "medium" | "high";

/**
 * Trust grows with a clean track record and resets to manual-only the moment
 * a reward for this referrer is ever rejected — staged approval, not a
 * one-time check, per the anti-spam requirement that invite rewards must
 * never be blanket-auto-approved.
 */
export async function getReferrerTrustTier(
  referrerId: string,
  database: RiskDatabase = db,
): Promise<ReferrerTrustTier> {
  const rows = await database
    .select({ status: affiliateReward.status })
    .from(affiliateReward)
    .where(
      and(
        eq(affiliateReward.referrerId, referrerId),
        eq(affiliateReward.type, AFFILIATE_REWARD_TYPES.registrationReset),
        inArray(affiliateReward.status, ["approved", "rejected"]),
      ),
    );

  const rejectedCount = rows.filter((row) => row.status === "rejected").length;
  if (rejectedCount > 0) {
    return "new";
  }

  const approvedCount = rows.filter((row) => row.status === "approved").length;
  if (approvedCount >= 3) {
    return "high";
  }
  if (approvedCount >= 1) {
    return "medium";
  }
  return "new";
}

const AUTO_APPROVE_THRESHOLDS: Record<ReferrerTrustTier, number | null> = {
  new: null, // never auto-approved — always goes to manual review
  medium: 10,
  high: 30,
};

export async function evaluateRegistrationReward(
  params: {
    referrerId: string;
    referredUserId: string;
    referredEmail: string;
    referredEmailVerified: boolean;
    referredCreatedAt: Date;
    claimedAt: Date;
    claimIpHash: string | null;
  },
  database: RiskDatabase = db,
): Promise<{ autoApprove: boolean; risk: RegistrationRewardRisk; tier: ReferrerTrustTier }> {
  const [risk, tier] = await Promise.all([
    computeRegistrationRewardRisk(params, database),
    getReferrerTrustTier(params.referrerId, database),
  ]);

  const threshold = AUTO_APPROVE_THRESHOLDS[tier];
  const autoApprove = !risk.hardBlock && threshold !== null && risk.score <= threshold;

  return { autoApprove, risk, tier };
}
