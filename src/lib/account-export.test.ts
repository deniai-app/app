import { getTableName, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ memberships: ["active-team"] }));
vi.mock("./version", () => ({ appVersion: "test" }));
vi.mock("@/db/drizzle", () => ({
  db: {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: (condition: SQL) => {
          let rows: unknown[] = [];
          if (getTableName(table) === "projects") {
            const projects = [
              { id: "personal", userId: "user", organizationId: null },
              { id: "current-team-project", userId: "user", organizationId: "active-team" },
              {
                id: "removed-team-project",
                userId: "user",
                organizationId: "removed-team",
                instructions: "New private team information",
              },
            ];
            const query = new PgDialect().sqlToQuery(condition);
            rows = projects.filter(
              (project) =>
                !query.sql.includes('"member"') ||
                !project.organizationId ||
                state.memberships.includes(project.organizationId),
            );
          }
          const result = Promise.resolve(rows);
          return Object.assign(result, {
            limit: () => result,
            orderBy: () => ({ limit: () => result }),
          });
        },
      }),
    }),
  },
}));
import { buildAccountExport } from "./account-export";
beforeEach(() => {
  state.memberships = ["active-team"];
});
test("account export never bypasses removal from a team project", async () => {
  const result = await buildAccountExport("user");
  expect(result.projects.map((project) => project.id)).toEqual([
    "personal",
    "current-team-project",
  ]);
  expect(JSON.stringify(result)).not.toContain("New private team information");
});
test("losing all memberships keeps personal data available without exporting team data", async () => {
  state.memberships = [];
  expect((await buildAccountExport("user")).projects.map((project) => project.id)).toEqual([
    "personal",
  ]);
});
