import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ mutate: vi.fn(() => ({ ok: true })) }));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_BETTER_AUTH_URL: "https://app.example" } }));
vi.mock("@/server/api/trpc", () => ({
  createContext: async () => ({ session: { userId: "victim" } }),
}));
vi.mock("@/server/api/root", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.create();
  return {
    appRouter: t.router({
      clearAll: t.procedure.mutation(() => state.mutate()),
      echo: t.procedure.input((value: unknown) => value).mutation(() => state.mutate()),
      get: t.procedure.query(() => ({ ok: true })),
    }),
  };
});
const { POST, GET } = await import("./route");
beforeEach(() => state.mutate.mockClear());

test("a cross-site form cannot execute a mutation without input", async () => {
  const response = await POST(
    new Request("https://app.example/api/trpc/clearAll", {
      method: "POST",
      headers: {
        origin: "https://attacker.app.example",
        cookie: "session=victim",
        "sec-fetch-site": "same-site",
      },
      body: new FormData(),
    }),
  );
  expect(response.status).toBe(403);
  expect(state.mutate).not.toHaveBeenCalled();
});

test("non-JSON mutations are rejected even without an Origin header", async () => {
  const response = await POST(
    new Request("https://app.example/api/trpc/clearAll", { method: "POST", body: new FormData() }),
  );
  expect(response.status).toBe(415);
  expect(state.mutate).not.toHaveBeenCalled();
});

test("same-origin JSON mutations remain available", async () => {
  const response = await POST(
    new Request("https://app.example/api/trpc/clearAll", {
      method: "POST",
      headers: { origin: "https://app.example", "content-type": "application/json" },
      body: "null",
    }),
  );
  expect(response.status).toBe(200);
  expect(state.mutate).toHaveBeenCalledOnce();
});

test("read-only queries remain available", async () => {
  expect((await GET(new Request("https://app.example/api/trpc/get"))).status).toBe(200);
});

test("oversized chunked RPC input is canceled before mutation execution", async () => {
  const cancel = vi.fn();
  let chunks = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunks++;
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel,
  });
  const response = await POST(
    new Request("https://app.example/api/trpc/echo", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "1" },
      body,
      duplex: "half",
    } as RequestInit),
  );
  expect(response.status).toBe(413);
  expect(state.mutate).not.toHaveBeenCalled();
  expect(chunks).toBeLessThan(35);
  expect(cancel).toHaveBeenCalledOnce();
});
