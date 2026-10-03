import { getTableName } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { canCompareModels } from "./usage";

const state = vi.hoisted(() => ({
  personal: null as Record<string, unknown> | null,
  team: null as Record<string, unknown> | null,
}));
vi.mock("@/db/drizzle", () => ({
  db: {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        let joined = false;
        const query = {
          innerJoin: () => {
            joined = true;
            return query;
          },
          where: () => {
            const record =
              getTableName(table) === "billing" ? (joined ? state.team : state.personal) : null;
            const rows = Promise.resolve(record ? [record] : []);
            return Object.assign(rows, { limit: () => rows });
          },
        };
        return query;
      },
    }),
  },
}));
vi.mock("./stripe", () => ({ stripe: {} }));
vi.mock("./billing-config", () => ({ isBillingDisabled: false }));

beforeEach(() => {
  state.personal = null;
  state.team = null;
});

test("Free users cannot compare", async () => {
  expect(await canCompareModels("user")).toBe(false);
});

test.each([
  ["plus_monthly", false],
  ["plus_yearly", false],
  ["pro_monthly", true],
  ["pro_yearly", true],
  ["pro_lifetime", true],
  ["max_monthly", true],
  ["max_yearly", true],
])("active %s comparison access is %s", async (planId, allowed) => {
  state.personal = { planId, status: "active" };
  expect(await canCompareModels("user")).toBe(allowed);
});

test.each(["pro_team_monthly", "pro_team_yearly", "max_team_monthly", "max_team_yearly"])(
  "%s grants access to a member with personal Plus",
  async (planId) => {
    state.personal = { planId: "plus_monthly", status: "active" };
    state.team = { planId, status: "active", organizationId: "team" };
    expect(await canCompareModels("user")).toBe(true);
  },
);

test("expired canceled Pro does not grant access", async () => {
  state.personal = { planId: "pro_monthly", status: "canceled", currentPeriodEnd: new Date(0) };
  expect(await canCompareModels("user")).toBe(false);
});

test("canceled Pro retains access until the paid period ends", async () => {
  state.personal = {
    planId: "pro_monthly",
    status: "canceled",
    currentPeriodEnd: new Date("2099-01-01"),
  };
  expect(await canCompareModels("user")).toBe(true);
});

test("expired canceled team does not grant access", async () => {
  state.team = { planId: "max_team_monthly", status: "canceled", currentPeriodEnd: new Date(0) };
  expect(await canCompareModels("user")).toBe(false);
});
