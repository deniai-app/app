import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ database: {} as Record<string, unknown> }));
vi.mock("../src/db/drizzle", () => ({
  db: new Proxy({}, { get: (_target, key) => state.database[key as string] }),
}));
vi.mock("../src/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        session: { userId: "current-user" },
        user: { isAnonymous: false },
      })),
    },
  },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("../src/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

const { apiKeysRouter } = await import("../src/server/api/routers/api-keys");
const { POST } = await import("../src/app/api/device-auth/route");
const dialect = new PgDialect();
type Key = { id: string; userId: string; name: string };
type Device = {
  id: string;
  deviceCode: string;
  userCode: string;
  userId: string;
  approved: boolean;
  expiresAt: Date;
  issuedApiKeyId: string | null;
  issuedApiKeyEnc: string | null;
};
let keys: Key[];
let devices: Device[];
let lockCount: number;
let failDeviceUpdate: boolean;

function database() {
  let tail = Promise.resolve();
  const select = () => ({
    from: (table: Parameters<typeof getTableName>[0]) => ({
      where: (condition: SQL) => {
        const { params } = dialect.sqlToQuery(condition);
        const rows =
          getTableName(table) === "api_key"
            ? keys.filter((key) => params.includes(key.userId))
            : devices.filter((device) =>
                params.some((value) =>
                  [device.id, device.deviceCode, device.userCode].includes(String(value)),
                ),
              );
        return {
          orderBy: async () => rows,
          limit: () =>
            Object.assign(Promise.resolve(rows.map((row) => ({ ...row }))), {
              for: async () => rows.map((row) => ({ ...row })),
            }),
        };
      },
    }),
  });
  return {
    select,
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      let snapshot: { keys: Key[]; devices: Device[] } | undefined;
      const tx = {
        select,
        execute: async (statement: SQL) => {
          const { sql, params } = dialect.sqlToQuery(statement);
          if (sql.includes('FROM "user"') && sql.includes("FOR UPDATE")) {
            lockCount++;
            const previous = tail;
            tail = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
            snapshot = { keys: structuredClone(keys), devices: structuredClone(devices) };
            return [];
          }
          expect(snapshot, "key insertion must follow the account row lock").toBeDefined();
          expect(sql).toContain("INSERT INTO api_key");
          if (keys.length >= 5) return [];
          const key = {
            id: `key-${keys.length}`,
            userId: String(params[0]),
            name: String(params[1]),
          };
          keys.push(key);
          return [{ id: key.id }];
        },
        insert: () => ({
          values: (values: Omit<Key, "id">) => ({
            returning: async () => {
              expect(snapshot).toBeDefined();
              const key = { ...values, id: `key-${keys.length}` };
              keys.push(key);
              return [{ id: key.id }];
            },
          }),
        }),
        update: () => ({
          set: (values: Partial<Device>) => ({
            where: async (condition: SQL) => {
              if (failDeviceUpdate) throw new Error("Simulated device update failure");
              const { params } = dialect.sqlToQuery(condition);
              const row = devices.find((device) => params.includes(device.id));
              if (row) Object.assign(row, values);
            },
          }),
        }),
        delete: () => ({
          where: (condition: SQL) => ({
            returning: async () => {
              const { params } = dialect.sqlToQuery(condition);
              const found = keys.filter(
                (key) => params.includes(key.id) && params.includes(key.userId),
              );
              keys = keys.filter((key) => !found.includes(key));
              return found;
            },
          }),
        }),
      };
      try {
        return await run(tx);
      } catch (error) {
        if (snapshot) {
          keys = snapshot.keys;
          devices = snapshot.devices;
        }
        throw error;
      } finally {
        release?.();
      }
    },
  };
}

beforeEach(() => {
  keys = Array.from({ length: 4 }, (_, index) => ({
    id: `existing-${index}`,
    userId: "current-user",
    name: "Existing",
  }));
  devices = ["first", "second"].map((id) => ({
    id,
    deviceCode: id,
    userCode: id,
    userId: "current-user",
    approved: true,
    expiresAt: new Date(Date.now() + 60_000),
    issuedApiKeyId: null,
    issuedApiKeyEnc: null,
  }));
  lockCount = 0;
  failDeviceUpdate = false;
  state.database = database();
});

function caller() {
  return apiKeysRouter.createCaller({
    db: state.database,
    session: { session: { userId: "current-user" }, user: { isAnonymous: false } },
  } as unknown as Parameters<typeof apiKeysRouter.createCaller>[0]);
}
function deviceRequest(action: string, fields: Record<string, string>) {
  return POST(
    new Request("http://localhost/api/device-auth", {
      method: "POST",
      body: JSON.stringify({ action, ...fields }),
    }),
  );
}

test("concurrent tRPC creates stop at five and all acquire the account lock", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => caller().create({ name: "Concurrent" })),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(keys).toHaveLength(5);
  expect(lockCount).toBe(8);
});

test("device polling and tRPC creation share the same account quota lock", async () => {
  const results = await Promise.allSettled([
    caller().create({ name: "Concurrent" }),
    deviceRequest("poll", { deviceCode: "first" }),
    deviceRequest("poll", { deviceCode: "second" }),
  ]);
  expect(keys).toHaveLength(5);
  expect(lockCount).toBe(3);
  let issued = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value instanceof Response) {
        const body = await result.value.json();
        if (body.apiKey) issued++;
        else expect(body.code).toBe("API_KEY_LIMIT_REACHED");
      } else issued++;
    }
  }
  expect(issued).toBe(1);
});

test("repeated polling issues one key and returns it only once", async () => {
  const responses = await Promise.all([
    deviceRequest("poll", { deviceCode: "first" }),
    deviceRequest("poll", { deviceCode: "first" }),
  ]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  expect(bodies.filter((body) => body.apiKey)).toHaveLength(1);
  expect(bodies.filter((body) => body.apiKeyUnavailable)).toHaveLength(1);
  expect(keys).toHaveLength(5);
});

test("a failed device update rolls back the inserted key", async () => {
  failDeviceUpdate = true;
  await expect(deviceRequest("poll", { deviceCode: "first" })).rejects.toThrow("Simulated");
  expect(keys).toHaveLength(4);
  expect(devices[0].issuedApiKeyId).toBeNull();
});

test("failed approval rolls back key revocation", async () => {
  keys.push({ id: "fifth", userId: "current-user", name: "Existing" });
  devices[0].approved = false;
  failDeviceUpdate = true;
  await expect(
    deviceRequest("approve", { userCode: "first", revokeKeyId: "fifth" }),
  ).rejects.toThrow("Simulated");
  expect(keys).toHaveLength(5);
  expect(keys.some((key) => key.id === "fifth")).toBe(true);
  expect(devices[0].approved).toBe(false);
});
