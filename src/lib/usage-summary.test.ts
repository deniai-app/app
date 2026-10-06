import { getTableName } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { getUsageSummary } from "./usage";

const state = vi.hoisted(() => ({ billingReads: 0, team: false }));
vi.mock("./max-mode", () => ({ isMaxModeEligible: () => true }));
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
            const name = getTableName(table);
            let rows: Record<string, unknown>[] = [];
            if (name === "billing") {
              state.billingReads++;
              rows = joined
                ? state.team
                  ? [
                      {
                        id: "team-row",
                        organizationId: "team",
                        planId: "max_team_monthly",
                        status: "active",
                        currentPeriodEnd: new Date("2026-07-01"),
                        maxModeEnabled: true,
                      },
                    ]
                  : []
                : [
                    {
                      planId: "pro_monthly",
                      status: "active",
                      currentPeriodEnd: new Date("2026-07-01"),
                      maxModeEnabled: true,
                    },
                  ];
            }
            if (name === "usage_quota")
              rows = ["basic", "premium"].map((category) => ({
                category,
                used: 123,
                unit: "tokens",
                periodStart: new Date("2026-06-01"),
                periodEnd: new Date("2026-07-01"),
              }));
            const result = Promise.resolve(rows);
            return Object.assign(result, { limit: () => result });
          },
        };
        return query;
      },
    }),
  },
}));

test.each([false, true])(
  "summary resolves personal/team entitlement once (team=%s)",
  async (team) => {
    state.team = team;
    state.billingReads = 0;
    const summary = await getUsageSummary({ userId: "user", now: new Date("2026-06-10") });
    // One entitlement lookup reads personal billing and joined team billing once each.
    expect(state.billingReads).toBe(2);
    expect(summary.tier).toBe(team ? "max" : "pro");
    expect(summary.usage.map(({ limit, used, remaining }) => ({ limit, used, remaining }))).toEqual(
      (team ? [1_200_000_000, 600_000_000] : [300_000_000, 150_000_000]).map((limit) => ({
        limit,
        used: 123,
        remaining: limit - 123,
      })),
    );
  },
);
