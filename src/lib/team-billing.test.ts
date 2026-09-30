import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, test, vi } from "vitest";
import { cancelPersonalSubscription, cancelOrgMembersPersonalSubscriptions } from "./team-billing";
import { stripe } from "./stripe";

const state = vi.hoisted(() => ({
  team: null as Record<string, unknown> | null,
  membership: true,
  liveTeamStatus: "active",
  licensed: true,
  teamError: false,
  updates: 0,
}));
vi.mock("./billing-config", () => ({ isBillingDisabled: false }));
vi.mock("./stripe", () => ({ stripe: { subscriptions: { retrieve: vi.fn(), cancel: vi.fn() } } }));
vi.mock("./stripe-subscriptions", () => ({
  getLicensedSubscriptionItem: (subscription: { items: { data: unknown[] } }) =>
    subscription.items.data[0],
}));
vi.mock("@/db/drizzle", () => ({
  db: {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: (condition: SQL) => {
          const { params } = new PgDialect().sqlToQuery(condition);
          const rows =
            getTableName(table) === "member"
              ? state.membership
                ? [{ id: "member", userId: "user" }]
                : []
              : params.includes("team")
                ? state.team
                  ? [state.team]
                  : []
                : [{ stripeSubscriptionId: "personal-sub" }];
          const result = Promise.resolve(rows);
          return Object.assign(result, {
            limit: () => result,
            orderBy: () => ({ limit: () => result }),
          });
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => {
          state.updates++;
        },
      }),
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.team = { stripeSubscriptionId: "team-sub", planId: "pro_team_monthly" };
  state.membership = true;
  state.liveTeamStatus = "active";
  state.licensed = true;
  state.teamError = false;
  state.updates = 0;
  vi.mocked(stripe.subscriptions.retrieve).mockImplementation(async (id) => {
    if (id === "team-sub" && state.teamError) throw new Error("Stripe unavailable");
    return {
      status: id === "team-sub" ? state.liveTeamStatus : "active",
      items: { data: state.licensed ? [{ id: "licensed" }] : [] },
    } as never;
  });
});

test("joining a free organization leaves the personal subscription untouched", async () => {
  state.team = null;
  await cancelPersonalSubscription("user", "team");
  expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  expect(state.updates).toBe(0);
});

test.each(["incomplete", "canceled", "unpaid", "paused", "incomplete_expired"])(
  "a %s team subscription cannot cancel the personal plan",
  async (status) => {
    state.liveTeamStatus = status;
    await cancelPersonalSubscription("user", "team");
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  },
);

test.each(["active", "trialing", "past_due"])(
  "a %s licensed team plan can replace the personal plan",
  async (status) => {
    state.liveTeamStatus = status;
    await cancelPersonalSubscription("user", "team");
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("personal-sub", { prorate: true });
    expect(state.updates).toBe(1);
  },
);

test("non-members and metered-only subscriptions cannot cancel a personal plan", async () => {
  state.membership = false;
  await cancelPersonalSubscription("user", "team");
  expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  state.membership = true;
  state.licensed = false;
  await cancelPersonalSubscription("user", "team");
  expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
});

test("Stripe verification failures preserve the personal subscription", async () => {
  state.teamError = true;
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await cancelPersonalSubscription("user", "team");
  expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  expect(state.updates).toBe(0);
  log.mockRestore();
});

test("bulk team activation also checks the destination team", async () => {
  state.team = null;
  await cancelOrgMembersPersonalSubscriptions("team");
  expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
});
