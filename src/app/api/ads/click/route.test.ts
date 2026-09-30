import { beforeEach, expect, test, vi } from "vitest";
import { env } from "@/env";
import { GET } from "./route";
import { anonymousAdViewerId } from "@/lib/ad-ip";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  campaign: vi.fn(),
  eligible: vi.fn(),
  freeViewer: vi.fn(),
  verify: vi.fn(),
  record: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/db/drizzle", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.campaign }) }) }) },
}));
vi.mock("@/lib/ads", () => ({
  adEligible: mocks.eligible,
  verifyAdDelivery: mocks.verify,
  recordAdEvent: mocks.record,
}));
vi.mock("@/lib/usage", () => ({ isFreeAdViewer: mocks.freeViewer }));

const id = "12345678-1234-1234-1234-123456789abc";
const destination = "https://advertiser.example/landing";
function clickRequest(
  referer = `${new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin}/chat`,
  ip?: string,
  token = "signed-token",
) {
  return new Request(`http://internal-proxy:3000/api/ads/click?id=${id}&token=${token}`, {
    headers: { referer, "sec-fetch-site": "same-origin", ...(ip ? { "x-forwarded-for": ip } : {}) },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ session: { userId: "viewer" }, user: { isAnonymous: false } });
  mocks.freeViewer.mockResolvedValue(true);
  mocks.campaign.mockResolvedValue([{ id, userId: "advertiser", url: destination }]);
  mocks.verify.mockReturnValue(true);
});

test("redirects a valid public-origin click through an internal proxy and records it", async () => {
  const response = await GET(clickRequest());
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(destination);
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(mocks.verify).toHaveBeenCalledWith("signed-token", id, "viewer", destination);
  expect(mocks.record).toHaveBeenCalledWith(id, "viewer", "click", false);
});

test("rejects foreign referrers before accessing the session or billing", async () => {
  expect((await GET(clickRequest("https://other.example/chat"))).status).toBe(403);
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.record).not.toHaveBeenCalled();
});

test("still rejects invalid delivery tokens without recording a click", async () => {
  mocks.verify.mockReturnValue(false);
  expect((await GET(clickRequest())).status).toBe(403);
  expect(mocks.record).not.toHaveBeenCalled();
});

test("records a public homepage click at guest weight with an IP-bound token", async () => {
  mocks.session.mockResolvedValue(null);
  const req = clickRequest(`${new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin}/home`, "192.0.2.1");
  const viewer = anonymousAdViewerId(req.headers)!;
  const { signAdDelivery, verifyAdDelivery } =
    await vi.importActual<typeof import("@/lib/ads")>("@/lib/ads");
  mocks.verify.mockImplementation(verifyAdDelivery);
  const token = signAdDelivery(id, viewer, destination);
  const response = await GET(
    clickRequest(`${new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin}/home`, "192.0.2.1", token),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(destination);
  expect(mocks.record).toHaveBeenCalledWith(id, viewer, "click", true);
  expect(mocks.eligible).toHaveBeenCalledWith(true);
  expect(mocks.freeViewer).not.toHaveBeenCalled();
});

test("rejects a public click token issued for another IP", async () => {
  mocks.session.mockResolvedValue(null);
  const { signAdDelivery, verifyAdDelivery } =
    await vi.importActual<typeof import("@/lib/ads")>("@/lib/ads");
  mocks.verify.mockImplementation(verifyAdDelivery);
  const viewer = anonymousAdViewerId(new Headers({ "x-forwarded-for": "192.0.2.1" }))!;
  const token = signAdDelivery(id, viewer, destination);
  expect((await GET(clickRequest(undefined, "192.0.2.2", token))).status).toBe(403);
  expect(mocks.record).not.toHaveBeenCalled();
});

test("does not bill public clicks without an IP", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await GET(clickRequest())).status).toBe(401);
  expect(mocks.record).not.toHaveBeenCalled();
});

test("does not let paid accounts fall back to IP billing", async () => {
  mocks.freeViewer.mockResolvedValue(false);
  expect((await GET(clickRequest(undefined, "192.0.2.1"))).status).toBe(403);
  expect(mocks.record).not.toHaveBeenCalled();
});
