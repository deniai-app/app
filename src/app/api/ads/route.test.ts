import { beforeEach, expect, test, vi } from "vitest";
import { GET } from "./route";
import { anonymousAdViewerId } from "@/lib/ad-ip";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  freeViewer: vi.fn(),
  choose: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/lib/usage", () => ({ isFreeAdViewer: mocks.freeViewer }));
vi.mock("@/lib/ads", () => ({ chooseAd: mocks.choose, signAdDelivery: mocks.sign }));

const ad = {
  id: "campaign",
  title: "English title",
  description: "English description",
  defaultLanguage: "en",
  japaneseTitle: "日本語タイトル",
  japaneseDescription: "日本語の説明",
  englishTitle: null,
  englishDescription: null,
  url: "https://advertiser.example/landing",
};

function request(placement = "home", locale = "en", ip?: string) {
  return new Request(`http://localhost/api/ads?placement=${placement}&locale=${locale}`, {
    headers: ip ? { "x-forwarded-for": ip } : {},
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue(null);
  mocks.freeViewer.mockResolvedValue(true);
  mocks.choose.mockResolvedValue(ad);
  mocks.sign.mockReturnValue("signed-token");
});

test("serves a non-billable localized homepage ad when no usable IP is available", async () => {
  const response = await GET(request("home", "ja"));
  expect(await response.json()).toEqual({
    ad: {
      id: ad.id,
      title: ad.japaneseTitle,
      description: ad.japaneseDescription,
      url: ad.url,
      token: "",
    },
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.choose).toHaveBeenCalledWith(undefined, true, null);
  expect(mocks.sign).not.toHaveBeenCalled();
});

test.each(["home", "chat"])("keeps signed-in delivery tracking for %s", async (placement) => {
  mocks.session.mockResolvedValue({ session: { userId: "viewer" }, user: { isAnonymous: false } });
  const response = await GET(request(placement));
  expect((await response.json()).ad.url).toBe("/api/ads/click?id=campaign&token=signed-token");
  expect(mocks.choose).toHaveBeenCalledWith("viewer", false, null);
  expect(mocks.sign).toHaveBeenCalledWith(ad.id, "viewer", ad.url);
});

test("keeps anonymous guest billing for the homepage", async () => {
  mocks.session.mockResolvedValue({ session: { userId: "guest" }, user: { isAnonymous: true } });
  expect((await (await GET(request())).json()).ad.token).toBe("signed-token");
  expect(mocks.choose).toHaveBeenCalledWith("guest", true, null);
  expect(mocks.freeViewer).not.toHaveBeenCalled();
});

test.each(["home", "chat"])("does not deliver ads to paid users on %s", async (placement) => {
  mocks.session.mockResolvedValue({ session: { userId: "paid" }, user: { isAnonymous: false } });
  mocks.freeViewer.mockResolvedValue(false);
  expect(await (await GET(request(placement))).json()).toEqual({ ad: null });
  expect(mocks.choose).not.toHaveBeenCalled();
});

test("still requires a session for chat ads", async () => {
  expect(await (await GET(request("chat"))).json()).toEqual({ ad: null });
  expect(mocks.choose).not.toHaveBeenCalled();
});

test("returns an empty slot when no ad is available", async () => {
  mocks.choose.mockResolvedValue(null);
  expect(await (await GET(request())).json()).toEqual({ ad: null });
});

test("binds public homepage deliveries to the IP and uses guest eligibility", async () => {
  const req = request("home", "en", "192.0.2.1");
  const viewer = anonymousAdViewerId(req.headers);
  expect((await (await GET(req)).json()).ad.url).toBe(
    "/api/ads/click?id=campaign&token=signed-token",
  );
  expect(mocks.choose).toHaveBeenCalledWith(viewer, true, null);
  expect(mocks.sign).toHaveBeenCalledWith(ad.id, viewer, ad.url);
});

test("keeps account identity instead of IP for signed-in users", async () => {
  mocks.session.mockResolvedValue({ session: { userId: "viewer" }, user: { isAnonymous: false } });
  await GET(request("home", "en", "192.0.2.1"));
  expect(mocks.sign).toHaveBeenCalledWith(ad.id, "viewer", ad.url);
});

test("rejects unknown placements", async () => {
  expect((await GET(request("unknown"))).status).toBe(400);
  expect(mocks.session).not.toHaveBeenCalled();
});
