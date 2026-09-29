import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { chooseAd, signAdDelivery } from "@/lib/ads";
import { localizedCreative } from "@/lib/ad-variants";
import { isFreeAdViewer } from "@/lib/usage";

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("placement") !== "chat") {
    return Response.json({ error: "Invalid placement" }, { status: 400 });
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (
    !session?.session ||
    (!session.user.isAnonymous && !(await isFreeAdViewer(session.session.userId)))
  ) {
    return Response.json({ ad: null }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const params = new URL(request.url).searchParams;
  const excludeId = params.get("exclude");
  const locale = params.get("locale") === "ja" ? "ja" : "en";
  const ad = await chooseAd(session.session.userId, Boolean(session.user.isAnonymous), excludeId);
  const token = ad ? signAdDelivery(ad.id, session.session.userId, ad.url) : null;
  return Response.json(
    {
      ad: ad
        ? {
            id: ad.id,
            ...localizedCreative(ad, locale),
            token,
            url: `/api/ads/click?id=${encodeURIComponent(ad.id)}&token=${encodeURIComponent(token ?? "")}`,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
