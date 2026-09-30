import { beforeEach, expect, test, vi } from "vitest";
import { env } from "@/env";
import { anonymousAdViewerId } from "@/lib/ad-ip";
import { signAdDelivery } from "@/lib/ads";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), freeViewer: vi.fn(), record: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/lib/usage", () => ({ isFreeAdViewer: mocks.freeViewer }));
vi.mock("@/lib/ads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ads")>()),
  recordAdEvent: mocks.record,
}));

const id = "12345678-1234-4234-8234-123456789abc";
const ipHeaders = new Headers({ "x-forwarded-for": "192.0.2.1" });
const viewer = anonymousAdViewerId(ipHeaders)!;
function request({
  ip = "192.0.2.1",
  token = signAdDelivery(id, viewer, "https://example.com"),
  origin = new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin,
} = {}) {
  return new Request("http://internal-proxy/api/ads/view", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ id, token }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue(null);
  mocks.freeViewer.mockResolvedValue(true);
});

test("records unauthenticated IP views at guest weight", async () => {
  expect((await POST(request())).status).toBe(204);
  expect(mocks.record).toHaveBeenCalledWith(id, viewer, "view", true);
  expect(mocks.freeViewer).not.toHaveBeenCalled();
});

test.each([{ ip: "192.0.2.2" }, { token: "forged-token" }, { token: "" }])(
  "rejects mismatched IP or invalid tokens: %j",
  async (options) => {
    expect((await POST(request(options))).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  },
);

test.each(["", "invalid"])("does not bill without a usable IP: %s", async (ip) => {
  expect((await POST(request({ ip }))).status).toBe(401);
  expect(mocks.record).not.toHaveBeenCalled();
});

test("rejects foreign origins", async () => {
  expect((await POST(request({ origin: "https://other.example" }))).status).toBe(403);
  expect(mocks.record).not.toHaveBeenCalled();
});

test("keeps signed-in account tracking", async () => {
  mocks.session.mockResolvedValue({ session: { userId: "user" }, user: { isAnonymous: false } });
  const token = signAdDelivery(id, "user", "https://example.com");
  expect((await POST(request({ token }))).status).toBe(204);
  expect(mocks.record).toHaveBeenCalledWith(id, "user", "view", false);
});

test("does not let paid accounts fall back to IP billing", async () => {
  mocks.session.mockResolvedValue({ session: { userId: "paid" }, user: { isAnonymous: false } });
  mocks.freeViewer.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(403);
  expect(mocks.record).not.toHaveBeenCalled();
});
