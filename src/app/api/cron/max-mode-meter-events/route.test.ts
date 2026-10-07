import { beforeEach, expect, test, vi } from "vitest";
import { GET } from "./route";

const state = vi.hoisted(() => ({
  env: {
    CRON_SECRET: "s".repeat(32) as string | undefined,
    STRIPE_SECRET_KEY: "test" as string | undefined,
  },
  retry: vi.fn(),
  recovery: vi.fn(),
  reviews: 0,
}));
vi.mock("@/env", () => ({ env: state.env }));
vi.mock("@/lib/max-mode", () => ({ retryMaxModeUsageReports: state.retry }));
vi.mock("@/lib/usage", () => ({ recoverUsageReservations: state.recovery }));
vi.mock("@/db/drizzle", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [{ total: state.reviews }] }) }) },
}));
beforeEach(() => {
  state.env.CRON_SECRET = "s".repeat(32);
  state.env.STRIPE_SECRET_KEY = "test";
  state.reviews = 0;
  state.retry.mockReset();
  state.retry.mockResolvedValue({ delivered: 1, failed: 0, requiresReview: 0 });
  state.recovery.mockReset().mockResolvedValue({ recovered: 0, recoveryFailed: 0 });
});
const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/max-mode-meter-events", {
    headers: authorization ? { authorization } : {},
  });

test.each([undefined, "Bearer invalid", `Bearer ${"x".repeat(32)}`])(
  "unauthorized workers cannot trigger billing: %s",
  async (authorization) => {
    expect((await GET(request(authorization))).status).toBe(401);
    expect(state.retry).not.toHaveBeenCalled();
    expect(state.recovery).not.toHaveBeenCalled();
  },
);
test("retry is disabled without a configured secret", async () => {
  state.env.CRON_SECRET = undefined;
  expect((await GET(request())).status).toBe(503);
  expect(state.retry).not.toHaveBeenCalled();
});
test("authenticated workers drain due reports without caching the response", async () => {
  const response = await GET(request(`Bearer ${state.env.CRON_SECRET}`));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    delivered: 1,
    failed: 0,
    requiresReview: 0,
    recovered: 0,
    recoveryFailed: 0,
  });
});

test("recovery failures produce a scheduler alert without dropping meter delivery", async () => {
  state.recovery.mockResolvedValue({ recovered: 0, recoveryFailed: 1 });
  expect((await GET(request(`Bearer ${state.env.CRON_SECRET}`))).status).toBe(503);
  expect(state.retry).toHaveBeenCalledOnce();
});

test("nonbilling deployments can still recover abandoned usage", async () => {
  state.env.STRIPE_SECRET_KEY = undefined;
  state.retry.mockResolvedValue({ delivered: 0, failed: 0, requiresReview: 0 });
  expect((await GET(request(`Bearer ${state.env.CRON_SECRET}`))).status).toBe(200);
  expect(state.recovery).toHaveBeenCalledOnce();
});
test("persistent manual-review items produce a scheduler alert", async () => {
  state.reviews = 1;
  const response = await GET(request(`Bearer ${state.env.CRON_SECRET}`));
  expect(response.status).toBe(503);
  expect((await response.json()).requiresReview).toBe(1);
});
