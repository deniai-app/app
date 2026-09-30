import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { adCampaign, adEvent } from "@/db/schema";
import { env } from "@/env";

export type AdCreative = {
  id: string;
  title: string;
  description: string;
  url: string;
  token: string;
};

function destinationHash(url: string) {
  return createHash("sha256").update(url).digest("hex");
}

export function signAdDelivery(id: string, userId: string, url: string) {
  const payload = Buffer.from(
    JSON.stringify({
      id,
      userId,
      destination: destinationHash(url),
      expires: Date.now() + 15 * 60_000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdDelivery(token: string, id: string, userId: string, url?: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || token.length > 1000) return false;
  const expected = createHmac("sha256", env.BETTER_AUTH_SECRET).update(payload).digest("base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return false;
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (
      typeof data === "object" &&
      data !== null &&
      "id" in data &&
      data.id === id &&
      "userId" in data &&
      data.userId === userId &&
      (url === undefined || ("destination" in data && data.destination === destinationHash(url))) &&
      "expires" in data &&
      typeof data.expires === "number" &&
      data.expires > Date.now()
    );
  } catch {
    return false;
  }
}

export const adPlans = ["cpm", "cpc", "fixed"] as const;
export type AdPlan = (typeof adPlans)[number];

export function adEligible(isGuest = false, now = new Date()) {
  return and(
    eq(adCampaign.status, "active"),
    or(isNull(adCampaign.startsAt), sql`${adCampaign.startsAt} <= ${now.toISOString()}::timestamp`),
    or(isNull(adCampaign.endsAt), sql`${adCampaign.endsAt} > ${now.toISOString()}::timestamp`),
    or(
      eq(adCampaign.plan, "fixed"),
      and(eq(adCampaign.plan, "cpm"), gt(adCampaign.budgetYen, adCampaign.spentYen)),
      and(
        eq(adCampaign.plan, "cpc"),
        sql`${adCampaign.budgetYen} - ${adCampaign.spentYen} >= ${isGuest ? 15 : 30}`,
      ),
    ),
  );
}

export function pickAd<T extends { id: string; plan: string }>(
  candidates: T[],
  excludeId?: string | null,
  random = Math.random,
): T | null {
  const fixed = candidates.filter((ad) => ad.plan === "fixed");
  const pool = fixed.length ? fixed : candidates;
  const alternatives =
    excludeId && pool.length > 1 ? pool.filter((ad) => ad.id !== excludeId) : pool;
  return alternatives.length ? alternatives[Math.floor(random() * alternatives.length)] : null;
}

export async function chooseAd(
  userId: string | undefined,
  isGuest = false,
  excludeId?: string | null,
) {
  const campaigns = await db.select().from(adCampaign).where(adEligible(isGuest));
  return pickAd(
    campaigns.filter((ad) => ad.userId !== userId),
    excludeId,
  );
}

/** One billable view per campaign/viewer/10-minute window and one click/day. */
export function eventKey(
  campaignId: string,
  userId: string,
  kind: "view" | "click",
  now = Date.now(),
) {
  const window = kind === "view" ? 600_000 : 86_400_000;
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`${campaignId}:${userId}:${kind}:${Math.floor(now / window)}`)
    .digest("hex");
}

export function adCharge(
  plan: AdPlan,
  kind: "view" | "click",
  previousUnits: number,
  isGuest: boolean,
) {
  const units = isGuest ? 1 : 2;
  // 10 units = 5 signed-in views = ¥1 = ¥200 per 1,000 views.
  if (plan === "cpm" && kind === "view")
    return Math.floor((previousUnits + units) / 10) - Math.floor(previousUnits / 10);
  if (plan === "cpc" && kind === "click") return isGuest ? 15 : 30;
  return 0;
}

export async function recordAdEvent(
  campaignId: string,
  userId: string,
  kind: "view" | "click",
  isGuest = false,
) {
  const id = eventKey(campaignId, userId, kind);
  return db.transaction(async (tx) => {
    // Serialize per campaign; prevents the last unit of budget being overspent.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${campaignId}))`);
    const [ad] = await tx
      .select()
      .from(adCampaign)
      .where(and(eq(adCampaign.id, campaignId), adEligible(isGuest)))
      .limit(1);
    if (!ad || ad.userId === userId) return false;
    const event = await tx
      .insert(adEvent)
      .values({ id, campaignId, kind })
      .onConflictDoNothing()
      .returning({ id: adEvent.id });
    if (!event.length) return false;
    const units = isGuest ? 1 : 2;
    const previousUnits = kind === "view" ? ad.weightedImpressionUnits : ad.weightedClickUnits;
    const charge = adCharge(ad.plan as AdPlan, kind, previousUnits, isGuest);
    if (ad.plan !== "fixed" && ad.spentYen + charge > ad.budgetYen) return false;
    await tx
      .update(adCampaign)
      .set({
        impressions: ad.impressions + (kind === "view" ? 1 : 0),
        clicks: ad.clicks + (kind === "click" ? 1 : 0),
        weightedImpressionUnits: ad.weightedImpressionUnits + (kind === "view" ? units : 0),
        weightedClickUnits: ad.weightedClickUnits + (kind === "click" ? units : 0),
        spentYen: ad.spentYen + charge,
        updatedAt: new Date(),
      })
      .where(eq(adCampaign.id, campaignId));
    return true;
  });
}
