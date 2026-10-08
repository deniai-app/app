import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  statuses: {} as Record<string, string>,
  cancelError: null as Error | null,
  deleted: false,
}));

vi.mock("./billing-config", () => ({ isBillingDisabled: false }));
vi.mock("./stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(async (id: string) => ({ id, status: state.statuses[id] })),
      cancel: vi.fn(async (id: string) => {
        if (state.cancelError) throw state.cancelError;
        return { id, status: "canceled" };
      }),
    },
  },
}));
vi.mock("@/db/drizzle", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () =>
          Object.keys(state.statuses).map((stripeSubscriptionId) => ({ stripeSubscriptionId })),
      }),
    }),
    delete: () => ({
      where: async () => {
        state.deleted = true;
      },
    }),
  },
}));

const { cancelTeamSubscriptionForDeletion } = await import("./team-billing");
const { stripe } = await import("./stripe");

beforeEach(() => {
  vi.clearAllMocks();
  state.statuses = {};
  state.cancelError = null;
  state.deleted = false;
});

test.each(["unpaid", "paused", "incomplete", "active", "trialing", "past_due"])(
  "cancels a %s team subscription before the organization is deleted",
  async (status) => {
    state.statuses = { sub_team: status };
    await cancelTeamSubscriptionForDeletion("org");
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_team", { prorate: true });
    expect(state.deleted).toBe(true);
  },
);

test.each(["canceled", "incomplete_expired"])("skips an ended %s subscription", async (status) => {
  state.statuses = { sub_team: status };
  await cancelTeamSubscriptionForDeletion("org");
  expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  expect(state.deleted).toBe(true);
});

test("a failed cancellation blocks deletion and keeps the billing rows", async () => {
  state.statuses = { sub_team: "unpaid" };
  state.cancelError = new Error("Stripe unavailable");
  await expect(cancelTeamSubscriptionForDeletion("org")).rejects.toThrow("Stripe unavailable");
  expect(state.deleted).toBe(false);
});
