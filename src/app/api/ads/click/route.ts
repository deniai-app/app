import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/drizzle";
import { adCampaign } from "@/db/schema";
import { isAllowedAdClickOrigin } from "@/lib/ad-origin";
import { auth } from "@/lib/auth";
import { adEligible, recordAdEvent, verifyAdDelivery } from "@/lib/ads";
import { isFreeAdViewer } from "@/lib/usage";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!isAllowedAdClickOrigin(request)) return new Response(null, { status: 403 });
  const id = url.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session) return new Response(null, { status: 401 });
  if (!session.user.isAnonymous && !(await isFreeAdViewer(session.session.userId)))
    return new Response(null, { status: 403 });
  const [ad] = await db
    .select()
    .from(adCampaign)
    .where(and(eq(adCampaign.id, id), adEligible(Boolean(session.user.isAnonymous))))
    .limit(1);
  if (!ad || ad.userId === session.session.userId) return new Response(null, { status: 404 });
  // Never send a viewer to a newly edited URL that was not shown in their ad.
  if (!verifyAdDelivery(url.searchParams.get("token") ?? "", id, session.session.userId, ad.url))
    return new Response(null, { status: 403 });
  const destination = new URL(ad.url);
  if (destination.protocol !== "https:") return new Response(null, { status: 404 });
  await recordAdEvent(id, session.session.userId, "click", Boolean(session.user.isAnonymous));
  return new Response(null, {
    status: 303,
    headers: {
      Location: destination.href,
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
