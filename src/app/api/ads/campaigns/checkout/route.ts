import { and, eq, gt, ne, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { adCampaign } from "@/db/schema";
import { env } from "@/env";
import { isAllowedAdOrigin } from "@/lib/ad-origin";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  if (!isAllowedAdOrigin(request)) return new Response(null, { status: 403 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session || session.user.isAnonymous) return new Response(null, { status: 401 });
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)
    return new Response(null, { status: 503 });
  const input = z
    .object({ id: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!input.success) return new Response(null, { status: 400 });

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('deni-fixed-ads'))`);
      const [ad] = await tx
        .select()
        .from(adCampaign)
        .where(and(eq(adCampaign.id, input.data.id), eq(adCampaign.userId, session.session.userId)))
        .limit(1);
      if (!ad || ad.status !== "approved") return null;
      if (ad.stripeSessionId) {
        const previous = await stripe.checkout.sessions.retrieve(ad.stripeSessionId);
        if (previous.status === "open") return previous.url;
        if (previous.status !== "expired") return null;
        await tx
          .update(adCampaign)
          .set({ stripeSessionId: null, checkoutExpiresAt: null })
          .where(eq(adCampaign.id, ad.id));
      }
      if (ad.plan === "fixed") {
        const [occupied] = await tx
          .select({ id: adCampaign.id })
          .from(adCampaign)
          .where(
            and(
              ne(adCampaign.id, ad.id),
              eq(adCampaign.plan, "fixed"),
              or(
                and(eq(adCampaign.status, "active"), gt(adCampaign.endsAt, new Date())),
                and(
                  eq(adCampaign.status, "approved"),
                  gt(adCampaign.checkoutExpiresAt, new Date()),
                ),
              ),
            ),
          )
          .limit(1);
        if (occupied) return null;
      }
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment",
        allow_promotion_codes: true,
        allowed_payment_method_types: ["card"],
        client_reference_id: session.session.userId,
        metadata: { adCampaignId: ad.id, userId: session.session.userId },
        payment_intent_data: { metadata: { adCampaignId: ad.id } },
        line_items: [
          {
            price_data: {
              currency: "jpy",
              unit_amount: ad.budgetYen,
              product_data: {
                name:
                  ad.plan === "fixed"
                    ? "Deni AI Ads — 30 days fixed chat slot"
                    : `Deni AI Ads — ${ad.plan.toUpperCase()} prepaid budget`,
              },
            },
            quantity: 1,
          },
        ],
        success_url: new URL(
          "/settings/ads?checkout=success",
          env.NEXT_PUBLIC_BETTER_AUTH_URL,
        ).toString(),
        cancel_url: new URL(
          "/settings/ads?checkout=cancel",
          env.NEXT_PUBLIC_BETTER_AUTH_URL,
        ).toString(),
      });
      await tx
        .update(adCampaign)
        .set({
          stripeSessionId: checkout.id,
          checkoutExpiresAt: new Date(checkout.expires_at * 1000),
        })
        .where(eq(adCampaign.id, ad.id));
      return checkout.url;
    });
    if (!result)
      return Response.json(
        { error: "Campaign unavailable or fixed slot occupied" },
        { status: 409 },
      );
    return Response.json({ url: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Ad checkout failed", error);
    return Response.json({ error: "Checkout unavailable" }, { status: 503 });
  }
}
