import { and, count, desc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { adCampaign } from "@/db/schema";
import { env } from "@/env";
import { reviewAd } from "@/lib/ad-review";
import {
  adCreativeSchema,
  adTargetLanguagesSchema,
  hasOnlyOppositeVariant,
} from "@/lib/ad-creative";
import { creativeFields } from "@/lib/ad-variants";
import { activatePaidAd, releaseExpiredAdCheckout } from "@/lib/ad-checkout";
import { adPlans } from "@/lib/ads";
import { isAllowedAdOrigin } from "@/lib/ad-origin";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

const inputSchema = z
  .object({
    ...adCreativeSchema.shape,
    plan: z.enum(adPlans),
    budgetYen: z.number().int().min(300).max(100_000),
    targetLanguages: adTargetLanguagesSchema,
  })
  .refine((input) => input.plan !== "fixed" || input.budgetYen === 3000)
  .refine(hasOnlyOppositeVariant);

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session || session.user.isAnonymous) return new Response(null, { status: 401 });
  const campaigns = await db
    .select()
    .from(adCampaign)
    .where(eq(adCampaign.userId, session.session.userId))
    .orderBy(desc(adCampaign.createdAt));

  // Stripe Checkout can finish before its webhook reaches us. Confirm only the
  // signed-in advertiser's own sessions with Stripe and reconcile them here too.
  const paymentStates = new Map<string, "open" | "paid" | "unknown">();
  if (env.STRIPE_SECRET_KEY) {
    await Promise.all(
      campaigns
        .filter((ad) => ad.status === "approved" && ad.stripeSessionId)
        .map(async (ad) => {
          try {
            if (!ad.stripeSessionId) return;
            const checkout = await stripe.checkout.sessions.retrieve(ad.stripeSessionId);
            if (checkout.status === "complete" && checkout.payment_status === "paid") {
              await activatePaidAd(checkout);
              paymentStates.set(ad.id, "paid");
            } else if (checkout.status === "expired") {
              await releaseExpiredAdCheckout(checkout);
            } else {
              paymentStates.set(ad.id, checkout.status === "open" ? "open" : "unknown");
            }
          } catch (error) {
            console.error("Ad payment reconciliation failed", { campaignId: ad.id, error });
            paymentStates.set(ad.id, "unknown");
          }
        }),
    );
  }
  const refreshed = await db
    .select()
    .from(adCampaign)
    .where(eq(adCampaign.userId, session.session.userId))
    .orderBy(desc(adCampaign.createdAt));
  return Response.json(
    {
      campaigns: refreshed.map((ad) => ({
        ...ad,
        paymentState:
          ad.status === "approved" && ad.stripeSessionId
            ? (paymentStates.get(ad.id) ?? "unknown")
            : null,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  if (!isAllowedAdOrigin(request)) return new Response(null, { status: 403 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session || session.user.isAnonymous) return new Response(null, { status: 401 });
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.OPENROUTER_API_KEY)
    return Response.json({ error: "Ads are unavailable" }, { status: 503 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json({ error: "Invalid creative or budget" }, { status: 400 });

  const [recent] = await db
    .select({ total: count() })
    .from(adCampaign)
    .where(
      and(
        eq(adCampaign.userId, session.session.userId),
        gt(adCampaign.createdAt, new Date(Date.now() - 86_400_000)),
      ),
    );
  if ((recent?.total ?? 0) >= 10)
    return Response.json({ error: "Daily submission limit reached" }, { status: 429 });

  // Never accept a previously reviewed creative ID from the browser. Each edit is a new review.
  let review;
  try {
    review = await reviewAd(input.data);
  } catch (error) {
    console.error("Ad review failed", error);
    return Response.json({ error: "Review unavailable; please try again later" }, { status: 503 });
  }
  const [campaign] = await db
    .insert(adCampaign)
    .values({
      userId: session.session.userId,
      ...creativeFields(input.data),
      plan: input.data.plan,
      budgetYen: input.data.budgetYen,
      targetLanguages: input.data.targetLanguages,
      status: review.approved ? "approved" : "rejected",
      reviewReason: review.reason,
    })
    .returning();
  return Response.json({ campaign }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
