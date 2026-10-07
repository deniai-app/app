import { and, eq, inArray, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { adCampaign } from "@/db/schema";
import { env } from "@/env";
import {
  adCreativeSchema,
  adTargetLanguagesSchema,
  hasOnlyOppositeVariant,
} from "@/lib/ad-creative";
import { creativeFields, sameCreative, storedCreative } from "@/lib/ad-variants";
import { reviewAd } from "@/lib/ad-review";
import { isAllowedAdOrigin } from "@/lib/ad-origin";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { readRequestJson, RequestBodyTooLargeError } from "@/lib/request-body";

const editSchema = z
  .strictObject({
    ...adCreativeSchema.shape,
    targetLanguages: adTargetLanguagesSchema,
    previous: adCreativeSchema,
  })
  .refine(hasOnlyOppositeVariant);

function sameTargetLanguages(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((language) => b.includes(language));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedAdOrigin(request)) return new Response(null, { status: 403 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session || session.user.isAnonymous) return new Response(null, { status: 401 });
  if (!env.OPENROUTER_API_KEY)
    return Response.json({ error: "Review unavailable" }, { status: 503 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });
  let body: unknown = null;
  try {
    body = await readRequestJson(request, 32 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return new Response(null, { status: 413 });
  }
  const input = editSchema.safeParse(body);
  if (!input.success) return Response.json({ error: "Invalid creative" }, { status: 400 });
  const { previous, targetLanguages, ...creative } = input.data;
  const [existing] = await db
    .select()
    .from(adCampaign)
    .where(and(eq(adCampaign.id, id), eq(adCampaign.userId, session.session.userId)))
    .limit(1);
  if (!existing) return new Response(null, { status: 404 });
  const canEdit =
    existing.status === "active" ||
    existing.status === "approved" ||
    (existing.status === "rejected" && !existing.stripeSessionId);
  if (!canEdit) return Response.json({ error: "Campaign cannot be edited" }, { status: 409 });
  if (!sameCreative(storedCreative(existing), previous))
    return Response.json({ error: "Campaign changed; refresh and try again" }, { status: 409 });
  if (sameCreative(storedCreative(existing), creative)) {
    if (sameTargetLanguages(existing.targetLanguages, targetLanguages))
      return Response.json({ campaign: existing }, { headers: { "Cache-Control": "no-store" } });
    // Targeting does not change the creative, so it needs no new AI review.
    const [updated] = await db
      .update(adCampaign)
      .set({ targetLanguages, updatedAt: new Date() })
      .where(
        and(
          eq(adCampaign.id, id),
          eq(adCampaign.userId, session.session.userId),
          eq(adCampaign.status, existing.status),
        ),
      )
      .returning();
    if (!updated)
      return Response.json({ error: "Campaign changed; refresh and try again" }, { status: 409 });
    return Response.json({ campaign: updated }, { headers: { "Cache-Control": "no-store" } });
  }

  const limit = await checkRateLimit({
    key: `ad-edit-review:${session.session.userId}`,
    windowMs: 86_400_000,
    maxRequests: 10,
  });
  if (!limit.allowed)
    return Response.json({ error: "Daily review limit reached" }, { status: 429 });
  let review;
  try {
    review = await reviewAd(creative);
  } catch (error) {
    console.error("Ad edit review failed", { campaignId: id, error });
    return Response.json({ error: "Review unavailable" }, { status: 503 });
  }
  if (!review.approved)
    return Response.json({ error: "Ad edit rejected", reason: review.reason }, { status: 422 });

  // Never modify pricing, Stripe state, dates, or counters when changing a creative.
  const [updated] = await db
    .update(adCampaign)
    .set({
      ...creativeFields(creative),
      targetLanguages,
      ...(existing.status === "rejected" ? { status: "approved" } : {}),
      reviewReason: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(adCampaign.id, id),
        eq(adCampaign.userId, session.session.userId),
        eq(adCampaign.title, previous.title),
        eq(adCampaign.description, previous.description),
        previous.defaultLanguage
          ? eq(adCampaign.defaultLanguage, previous.defaultLanguage)
          : isNull(adCampaign.defaultLanguage),
        eq(adCampaign.url, previous.url),
        previous.japaneseVariant
          ? eq(adCampaign.japaneseTitle, previous.japaneseVariant.title)
          : isNull(adCampaign.japaneseTitle),
        previous.japaneseVariant
          ? eq(adCampaign.japaneseDescription, previous.japaneseVariant.description)
          : isNull(adCampaign.japaneseDescription),
        previous.englishVariant
          ? eq(adCampaign.englishTitle, previous.englishVariant.title)
          : isNull(adCampaign.englishTitle),
        previous.englishVariant
          ? eq(adCampaign.englishDescription, previous.englishVariant.description)
          : isNull(adCampaign.englishDescription),
        inArray(
          adCampaign.status,
          existing.status === "rejected" ? ["rejected"] : ["approved", "active"],
        ),
      ),
    )
    .returning();
  if (!updated)
    return Response.json({ error: "Campaign changed; refresh and try again" }, { status: 409 });
  return Response.json({ campaign: updated }, { headers: { "Cache-Control": "no-store" } });
}
