import { getTableName } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { billingRouter } from "@/server/api/routers/billing";
import { organizationRouter } from "@/server/api/routers/organization";

const state = vi.hoisted(() => ({
  portalConfigurationId: undefined as string | undefined,
  createPortalSession: vi.fn(),
}));
vi.mock("@/env", async (importOriginal) => {
  const { env } = await importOriginal<typeof import("@/env")>();
  return {
    env: {
      ...env,
      get STRIPE_PORTAL_CONFIGURATION_ID() {
        return state.portalConfigurationId;
      },
    },
  };
});
vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/billing-config", () => ({ isBillingDisabled: false }));
vi.mock("@/lib/team-billing", () => ({
  getOrgMemberCount: vi.fn(async () => 2),
  updateTeamSeatCount: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    // No live subscription: portal access only needs the billing customer.
    subscriptions: { list: async () => ({ data: [] }) },
    billingPortal: { sessions: { create: state.createPortalSession } },
  },
}));

function database() {
  const record = {
    id: "row",
    userId: "user",
    organizationId: null as string | null,
    stripeCustomerId: "customer",
    stripeSubscriptionId: null,
    planId: null,
    status: "inactive",
    mode: null,
    firstPaidAt: null,
    flashOfferEndsAt: new Date(),
  };
  const database = {
    execute: async () => {},
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: () => {
          const rows =
            getTableName(table) === "member" ? [{ role: "owner", userId: "user" }] : [record];
          const result = Promise.resolve(rows);
          return Object.assign(result, {
            limit: () => result,
            orderBy: () => ({ limit: () => result }),
          });
        },
      }),
    }),
    update: () => ({
      set: (updates: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => [Object.assign(record, updates)],
        }),
      }),
    }),
    transaction: async (run: (transaction: unknown) => Promise<unknown>) => run(database),
  };
  return database;
}

function context() {
  return {
    db: database(),
    session: { session: { userId: "user" }, user: { isAnonymous: false, emailVerified: true } },
    userId: "user",
  } as never;
}

const portals = [
  {
    name: "personal",
    open: () => billingRouter.createCaller(context()).createPortalSession(),
    returnUrl: "http://localhost:3000/settings/billing",
  },
  {
    name: "team",
    open: () =>
      organizationRouter
        .createCaller(context())
        .createTeamPortalSession({ organizationId: "team" }),
    returnUrl: "http://localhost:3000/settings/team",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  state.portalConfigurationId = undefined;
  state.createPortalSession.mockResolvedValue({ url: "https://billing.stripe.test/session" });
});

test.each(portals)(
  "$name portal sessions pin STRIPE_PORTAL_CONFIGURATION_ID",
  async ({ open, returnUrl }) => {
    state.portalConfigurationId = "bpc_app_managed";
    await expect(open()).resolves.toEqual({ url: "https://billing.stripe.test/session" });
    expect(state.createPortalSession).toHaveBeenCalledWith({
      customer: "customer",
      return_url: returnUrl,
      configuration: "bpc_app_managed",
    });
  },
);

test.each(portals)(
  "$name portal sessions use the default configuration when unset",
  async ({ open, returnUrl }) => {
    await open();
    expect(state.createPortalSession).toHaveBeenCalledTimes(1);
    const [params] = state.createPortalSession.mock.calls[0] ?? [];
    expect(params).toEqual({ customer: "customer", return_url: returnUrl });
    expect(params).not.toHaveProperty("configuration");
  },
);
