import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { chooseAd, signAdDelivery } from "@/lib/ads";
import { localizedCreative } from "@/lib/ad-variants";
import { isFreeAdViewer } from "@/lib/usage";
import { anonymousAdViewerId } from "@/lib/ad-ip";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const placement = params.get("placement");
  if (placement !== "chat" && placement !== "home") {
    return Response.json({ error: "Invalid placement" }, { status: 400 });
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (
    (!session?.session && placement !== "home") ||
    (session?.session &&
      !session.user.isAnonymous &&
      !(await isFreeAdViewer(session.session.userId)))
  ) {
    return Response.json({ ad: null }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const excludeId = params.get("exclude");
  const locale = params.get("locale") === "ja" ? "ja" : "en";
  const viewerId = session?.session?.userId ?? anonymousAdViewerId(request.headers);
  const ad = await chooseAd(
    viewerId,
    !session?.session || Boolean(session.user.isAnonymous),
    excludeId,
    locale,
  );
  const token = ad && viewerId ? signAdDelivery(ad.id, viewerId, ad.url) : "";
  return Response.json(
    {
      ad: ad
        ? {
            id: ad.id,
            ...localizedCreative(ad, locale),
            token,
            // Without a usable IP or account, show the ad without billable tracking.
            url: token
              ? `/api/ads/click?id=${encodeURIComponent(ad.id)}&token=${encodeURIComponent(token)}`
              : ad.url,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
