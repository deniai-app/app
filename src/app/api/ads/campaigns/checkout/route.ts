import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
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
    const result = await resolveCheckout(input.data.id, session.session.userId);
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

async function resolveCheckout(id: string, userId: string) {
  const initial = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('deni-fixed-ads'))`);
    const [ad] = await tx
      .select()
      .from(adCampaign)
      .where(and(eq(adCampaign.id, id), eq(adCampaign.userId, userId)))
      .limit(1);
    return ad?.status === "approved" ? ad : null;
  });
  if (!initial) return null;

  // Retrieve without occupying a connection or the global fixed-slot lock.
  const previous = initial.stripeSessionId
    ? await stripe.checkout.sessions.retrieve(initial.stripeSessionId)
    : null;
  if (previous && previous.status !== "open" && previous.status !== "expired") return null;

  const reservation = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('deni-fixed-ads'))`);
    const [ad] = await tx
      .select()
      .from(adCampaign)
      .where(and(eq(adCampaign.id, id), eq(adCampaign.userId, userId)))
      .limit(1);
    if (!ad || ad.status !== "approved" || ad.stripeSessionId !== initial.stripeSessionId)
      return null;
    if (previous?.status === "open") return { url: previous.url };

    const now = new Date();
    if (ad.plan === "fixed") {
      const [occupied] = await tx
        .select({ id: adCampaign.id })
        .from(adCampaign)
        .where(
          and(
            ne(adCampaign.id, ad.id),
            eq(adCampaign.plan, "fixed"),
            or(
              and(eq(adCampaign.status, "active"), gt(adCampaign.endsAt, now)),
              and(eq(adCampaign.status, "approved"), gt(adCampaign.checkoutExpiresAt, now)),
            ),
          ),
        )
        .limit(1);
      if (occupied) return null;
    }

    // Persist the reservation before Stripe I/O. Concurrent requests for this
    // campaign reuse its expiry and idempotency key; other fixed campaigns wait.
    // Keep an uncertain/failed creation reserved so retries recover the same session.
    const expiresAt =
      !previous && ad.checkoutExpiresAt && ad.checkoutExpiresAt > now
        ? ad.checkoutExpiresAt
        : new Date((Math.floor(Date.now() / 1000) + 23 * 60 * 60) * 1000);
    await tx
      .update(adCampaign)
      .set({ stripeSessionId: null, checkoutExpiresAt: expiresAt })
      .where(eq(adCampaign.id, ad.id));
    return { ad, expiresAt };
  });
  if (!reservation) return null;
  if ("url" in reservation) return reservation.url;
  const { ad, expiresAt } = reservation;
  const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
  let checkout: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        expires_at: expiresAtSeconds,
        allow_promotion_codes: true,
        allowed_payment_method_types: ["card"],
        client_reference_id: userId,
        metadata: { adCampaignId: ad.id, userId },
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
      },
      { idempotencyKey: `ad-checkout-${ad.id}-${expiresAtSeconds}` },
    );
  } catch (error) {
    await releaseUnusedReservation(ad.id, expiresAt, error);
    throw error;
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('deni-fixed-ads'))`);
    const [current] = await tx.select().from(adCampaign).where(eq(adCampaign.id, ad.id)).limit(1);
    if (
      !current ||
      current.status !== "approved" ||
      current.userId !== userId ||
      current.plan !== ad.plan ||
      current.budgetYen !== ad.budgetYen ||
      current.checkoutExpiresAt?.getTime() !== expiresAt.getTime() ||
      (current.stripeSessionId !== null && current.stripeSessionId !== checkout.id)
    )
      return null;
    await tx
      .update(adCampaign)
      .set({
        stripeSessionId: checkout.id,
        checkoutExpiresAt: new Date(checkout.expires_at * 1000),
      })
      .where(eq(adCampaign.id, ad.id));
    return checkout.url;
  });
}

/**
 * A definitive Stripe rejection (4xx other than an in-flight idempotent request)
 * means no session exists, so the fixed slot must not stay reserved for hours.
 * Timeouts and 5xx are uncertain: the session may exist, so the reservation stays
 * and a retry reuses its idempotency key.
 */
async function releaseUnusedReservation(id: string, expiresAt: Date, error: unknown) {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status !== "number" || status < 400 || status >= 500 || status === 409) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('deni-fixed-ads'))`);
    await tx
      .update(adCampaign)
      .set({ checkoutExpiresAt: null })
      .where(
        and(
          eq(adCampaign.id, id),
          eq(adCampaign.status, "approved"),
          isNull(adCampaign.stripeSessionId),
          eq(adCampaign.checkoutExpiresAt, expiresAt),
        ),
      );
  });
}
