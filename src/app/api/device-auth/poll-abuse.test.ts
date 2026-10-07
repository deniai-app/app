import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ lookups: vi.fn() }));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_BETTER_AUTH_URL: "https://app.example" } }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock("@/lib/client-ip", () => ({ resolveClientIp: () => "poll-abuse-test-ip" }));
vi.mock("@/db/drizzle", () => ({
  db: {
    select: () => {
      state.lookups();
      return { from: () => ({ where: () => ({ limit: async () => [] }) }) };
    },
  },
}));
const { POST } = await import("./route");
beforeEach(() => state.lookups.mockClear());
const poll = (code: string) =>
  POST(
    new Request("https://app.example/api/device-auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "poll", deviceCode: code }),
    }),
  );
test("random device codes share a network budget and cannot grow counters without bound", async () => {
  for (let index = 0; index < 60; index++)
    expect((await poll(index.toString(16).padStart(64, "0"))).status).toBe(404);
  const response = await poll("f".repeat(64));
  expect(response.status).toBe(429);
  expect(response.headers.has("retry-after")).toBe(true);
  expect(state.lookups).toHaveBeenCalledTimes(60);
});
test("malformed codes are rejected before creating a limiter key or querying the database", async () => {
  expect((await poll("arbitrary-key")).status).toBe(400);
  expect(state.lookups).not.toHaveBeenCalled();
});
