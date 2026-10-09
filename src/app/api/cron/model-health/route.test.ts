import { beforeEach, expect, test, vi } from "vitest";
import { GET } from "./route";

const state = vi.hoisted(() => ({
  env: { CRON_SECRET: "s".repeat(32) as string | undefined },
  check: vi.fn(),
}));
vi.mock("@/env", () => ({ env: state.env }));
vi.mock("@/lib/model-health", () => ({ checkModelHealth: state.check }));

beforeEach(() => {
  state.env.CRON_SECRET = "s".repeat(32);
  state.check.mockReset().mockResolvedValue([]);
});
const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/model-health", {
    headers: authorization ? { authorization } : {},
  });

test.each([undefined, "Bearer invalid", `Bearer ${"x".repeat(32)}`])(
  "unauthorized callers cannot trigger probes: %s",
  async (authorization) => {
    expect((await GET(request(authorization))).status).toBe(401);
    expect(state.check).not.toHaveBeenCalled();
  },
);

test("probes are disabled without a configured secret", async () => {
  state.env.CRON_SECRET = undefined;
  expect((await GET(request())).status).toBe(503);
  expect(state.check).not.toHaveBeenCalled();
});

test("unavailable models do not fail the scheduler", async () => {
  const results = [
    { model: "gpt-6-luna", provider: "openai", available: false, latencyMs: 5, error: "boom" },
  ];
  state.check.mockResolvedValue(results);
  const response = await GET(request(`Bearer ${state.env.CRON_SECRET}`));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ results });
});
