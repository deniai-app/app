import { beforeEach, expect, test, vi } from "vitest";
import { apiKey, deviceAuthCode } from "@/db/schema";

type Row = Record<string, unknown>;
type Query = Promise<unknown[]> & {
  where: () => Query;
  limit: () => Query;
  orderBy: () => Query;
  for: () => Query;
};

const state = vi.hoisted(() => ({
  code: {} as Row,
  keys: [] as Row[],
}));

vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_BETTER_AUTH_URL: "http://localhost:3000" } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/client-ip", () => ({ resolveClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/crypto", () => ({
  encryptToB64: async (value: string) => `enc:${value}`,
  decryptFromB64: async (value: string) => value.replace(/^enc:/, ""),
}));
vi.mock("@/lib/api-key-utils", () => ({
  generateApiKey: () => "deni_rawkey",
  hashApiKey: async (raw: string) => `hash:${raw}`,
  getKeyPrefix: (raw: string) => raw.slice(0, 5),
}));

vi.mock("@/lib/api-key-quota", async () => {
  const { db } = await import("@/db/drizzle");
  return {
    MAX_API_KEYS: 5,
    withApiKeyLock: (_database: unknown, _userId: string, run: (tx: unknown) => unknown) => run(db),
  };
});

vi.mock("@/db/drizzle", () => {
  function rowsFor(table: unknown) {
    return table === deviceAuthCode ? [state.code] : table === apiKey ? state.keys : [];
  }
  // A real promise with the query-builder methods attached, so awaiting any step yields the rows.
  const chain = (table: unknown) => {
    const query: Query = Object.assign(Promise.resolve(rowsFor(table)), {
      where: () => query,
      limit: () => query,
      orderBy: () => query,
      for: () => query,
    });
    return query;
  };
  return {
    db: {
      select: () => ({ from: (table: unknown) => chain(table) }),
      update: (table: unknown) => ({
        set: (values: Row) => ({
          where: () => {
            if (table === deviceAuthCode) Object.assign(state.code, values);
            return Promise.resolve();
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: (values: Row) => ({
          returning: async () => {
            if (table === apiKey) state.keys.push({ id: "key-1", ...values });
            return [{ id: "key-1" }];
          },
        }),
      }),
      delete: () => ({ where: () => ({ returning: async () => [] }) }),
      execute: async () => [],
      transaction: async (run: (tx: unknown) => unknown) => {
        const { db } = await import("@/db/drizzle");
        return run(db);
      },
    },
  };
});

const { POST } = await import("./route");

function poll() {
  return POST(
    new Request("http://localhost/api/device-auth", {
      method: "POST",
      body: JSON.stringify({ action: "poll", deviceCode: "device" }),
    }),
  );
}

beforeEach(() => {
  state.keys = [];
  state.code = {
    id: "code-1",
    deviceCode: "device",
    userId: "user",
    approved: true,
    issuedApiKeyEnc: null,
    issuedApiKeyId: null,
    issuedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  };
});

test("a lost response can be recovered once within the window", async () => {
  const first = await (await poll()).json();
  expect(first).toMatchObject({ approved: true, apiKey: "deni_rawkey", apiKeyId: "key-1" });
  expect(state.code.issuedApiKeyEnc).toBe("enc:deni_rawkey");

  const retry = await (await poll()).json();
  expect(retry).toMatchObject({ approved: true, apiKey: "deni_rawkey", apiKeyId: "key-1" });
  expect(state.code.issuedApiKeyEnc).toBeNull();

  const third = await (await poll()).json();
  expect(third).toEqual({ approved: true, apiKeyUnavailable: true });
});

test("the encrypted copy is wiped and not handed out after the window", async () => {
  await poll();
  state.code.issuedAt = new Date(Date.now() - 10 * 60_000);

  const late = await (await poll()).json();
  expect(late).toEqual({ approved: true, apiKeyUnavailable: true });
  expect(state.code.issuedApiKeyEnc).toBeNull();
});

test("a key the user already revoked is not handed out again", async () => {
  await poll();
  state.keys = [];

  const retry = await (await poll()).json();
  expect(retry).toEqual({ approved: true, apiKeyUnavailable: true });
  expect(state.code.issuedApiKeyEnc).toBeNull();
});
