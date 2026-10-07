import { isIP } from "node:net";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { signupRisk } from "@/db/schema";
import {
  extractEmailDomain,
  extractEmailLocalPart,
  isAllowedEducationalDomain,
  isRandomLookingLocalPart,
} from "@/lib/email-domain-policy";
import { hashClaimIp } from "@/lib/affiliate-risk";
import { checkRateLimit } from "@/lib/rate-limit";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Accounts one network may create. Schools share a network, so they get far more room. */
const LIMITS = {
  burstPerHour: 3,
  perDay: 8,
  educationalPerDay: 60,
} as const;

/** Score at which a sign-up is flagged. */
export const FLAG_THRESHOLD = 2;

export const SIGNUP_RISK_FLAGS = {
  automationClient: "automation_client",
  randomLocalPart: "random_local_part",
  repeatNetwork: "repeat_network",
  busyNetwork: "busy_network",
} as const;

export type SignupAssessment = { score: number; flags: string[]; flagged: boolean };

/** IPv4 as is; IPv6 reduced to its /64, because one subscriber controls a whole /64. */
export function networkKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  // URL canonicalization also converts dotted IPv4 tails into hex groups.
  const canonical = new URL(`http://[${ip.split("%")[0]}]/`).hostname.slice(1, -1);
  const [head, tail] = canonical.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = (
    tail === undefined
      ? left
      : [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right]
  ).map((group) => Number.parseInt(group, 16));
  // IPv4-mapped addresses must share the native IPv4 limit, not one global /64.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".");
  }
  return groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":");
}

const AUTOMATION_CLIENT =
  /^$|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|node-fetch|undici|axios\/|okhttp|java\/|libwww|scrapy|headlesschrome|phantomjs|playwright|puppeteer/i;

export function isAutomationUserAgent(userAgent: string | null | undefined): boolean {
  return AUTOMATION_CLIENT.test((userAgent ?? "").trim());
}

function isEducationalEmail(email: string) {
  const domain = extractEmailDomain(email);
  return domain !== null && isAllowedEducationalDomain(domain);
}

/**
 * Scores one sign-up. A single weak signal is not enough: `taro1990` alone is a
 * normal address, but the same shape as a second account from one network is not.
 * `networkAccountCount` is how many accounts this network created today, counting this one.
 */
export function assessSignup({
  email,
  userAgent,
  networkAccountCount,
}: {
  email: string;
  userAgent: string | null | undefined;
  networkAccountCount: number | null;
}): SignupAssessment {
  const flags: string[] = [];
  let score = 0;
  const educational = isEducationalEmail(email);

  if (isAutomationUserAgent(userAgent)) {
    flags.push(SIGNUP_RISK_FLAGS.automationClient);
    score += 2;
  }

  const local = extractEmailLocalPart(email);
  if (!educational && local && isRandomLookingLocalPart(local)) {
    flags.push(SIGNUP_RISK_FLAGS.randomLocalPart);
    score += 1;
  }

  // Schools sit behind one address; their cap is the daily limit alone.
  if (!educational && networkAccountCount !== null) {
    if (networkAccountCount >= 2) {
      flags.push(SIGNUP_RISK_FLAGS.repeatNetwork);
      score += 1;
    }
    if (networkAccountCount >= 3) {
      flags.push(SIGNUP_RISK_FLAGS.busyNetwork);
      score += 1;
    }
  }

  return { score, flags, flagged: score >= FLAG_THRESHOLD };
}

/**
 * Hard cap on accounts created from one network. Runs before the account exists,
 * so a refused sign-up leaves nothing behind. Without a usable IP nothing is limited.
 */
export async function checkSignupLimits({
  email,
  ip,
}: {
  email: string;
  ip: string | undefined;
}): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  if (!ip) return { allowed: true };
  const network = networkKey(ip);
  const educational = isEducationalEmail(email);

  const daily = await checkRateLimit({
    key: `signup:day:${network}`,
    windowMs: DAY_MS,
    maxRequests: educational ? LIMITS.educationalPerDay : LIMITS.perDay,
  });
  if (!daily.allowed) return daily;

  if (educational) return { allowed: true };
  return checkRateLimit({
    key: `signup:hour:${network}`,
    windowMs: HOUR_MS,
    maxRequests: LIMITS.burstPerHour,
  });
}

/** How many accounts this network created in the last day (this one included), or null if unknown. */
async function countNetworkAccounts(ip: string | undefined): Promise<number | null> {
  if (!ip) return null;
  const network = networkKey(ip);
  let count = 1;
  // Fixed-window counters only report allowed/denied, so one counter per threshold.
  for (const threshold of [1, 2]) {
    const result = await checkRateLimit({
      key: `signup:seen:${threshold}:${network}`,
      windowMs: DAY_MS,
      maxRequests: threshold,
    });
    if (!result.allowed) count = threshold + 1;
  }
  return count;
}

/** Assess a freshly created account and remember it if it looks like part of a batch. */
export async function recordSignupRisk({
  userId,
  email,
  ip,
  userAgent,
}: {
  userId: string;
  email: string;
  ip: string | undefined;
  userAgent: string | null | undefined;
}): Promise<SignupAssessment> {
  const assessment = assessSignup({
    email,
    userAgent,
    networkAccountCount: await countNetworkAccounts(ip),
  });
  if (assessment.flagged) {
    await db
      .insert(signupRisk)
      .values({
        userId,
        score: assessment.score,
        flags: assessment.flags,
        // Hashed per network (IPv6 by /64), the same grouping the sign-up limits use.
        ipHash: hashClaimIp(ip ? networkKey(ip) : null),
      })
      .onConflictDoNothing();
  }
  return assessment;
}

type SignupRiskDatabase = Pick<typeof db, "select">;

/**
 * Whether the account was flagged at sign-up. Pass the caller's own connection so a lookup
 * inside a usage transaction does not need a second pooled connection. Apply the
 * `signup_risk` migration before deploying: inside a transaction a failed query aborts it,
 * so the fallback below only protects callers outside one.
 */
export async function isSignupFlagged(
  userId: string,
  database: SignupRiskDatabase = db,
): Promise<boolean> {
  try {
    const [row] = await database
      .select({ userId: signupRisk.userId })
      .from(signupRisk)
      .where(eq(signupRisk.userId, userId))
      .limit(1);
    return Boolean(row);
  } catch (error) {
    console.warn("[signup-risk] lookup failed; treating the account as not flagged", error);
    return false;
  }
}
