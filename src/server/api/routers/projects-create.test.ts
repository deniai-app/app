import { beforeEach, expect, test, vi } from "vitest";
import type { Context } from "../trpc";

vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: {} }));

const { projectsRouter } = await import("./projects");

const state = vi.hoisted(() => ({
  isMember: true,
  /** Membership rows locked by an open transaction; removal waits for them. */
  lockRelease: null as Promise<void> | null,
  removal: null as Promise<void> | null,
  removeDuringCheck: false,
  insertedWhileMember: [] as boolean[],
}));

function removeMembership() {
  state.removal = (async () => {
    await state.lockRelease;
    state.isMember = false;
  })();
}

function database(lockable: boolean) {
  return {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = state.isMember ? [{ id: "member-1" }] : [];
          const read = async (locked: boolean) => {
            if (locked && lockable && rows.length) {
              let release = () => {};
              state.lockRelease = new Promise<void>((resolve) => (release = resolve));
              (database as unknown as { release?: () => void }).release = release;
            }
            // The member is removed right after the membership check.
            if (state.removeDuringCheck) removeMembership();
            await Promise.resolve();
            return rows;
          };
          return {
            // Lazy like drizzle: the query runs once, locked only when `.for()` is used.
            limit: () => {
              let result: Promise<{ id: string }[]> | undefined;
              const once = (locked: boolean) => (result ??= read(locked));
              return Object.assign(
                Promise.resolve().then(() => once(false)),
                { for: () => once(true) },
              );
            },
          };
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          state.insertedWhileMember.push(state.isMember);
          return [{ id: "project-1", ...values }];
        },
      }),
    }),
  };
}

const caller = () =>
  projectsRouter.createCaller({
    db: {
      ...database(false),
      transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        try {
          return await run(database(true));
        } finally {
          (database as unknown as { release?: () => void }).release?.();
        }
      },
    } as unknown as Context["db"],
    session: { session: { userId: "user-1" } } as Context["session"],
  });

const input = {
  name: "Roadmap",
  description: null,
  instructions: "",
  color: "amber",
  organizationId: "org-1",
};

beforeEach(() => {
  state.isMember = true;
  state.lockRelease = null;
  state.removal = null;
  state.removeDuringCheck = false;
  state.insertedWhileMember = [];
});

test("a membership removed between check and write cannot leave a team project behind", async () => {
  state.removeDuringCheck = true;
  await caller().create(input);
  await state.removal;

  // The removal waits for the create to commit; the project was written by a member.
  expect(state.insertedWhileMember).toEqual([true]);
  expect(state.isMember).toBe(false);
});

test("a former member cannot create a project in the team", async () => {
  state.isMember = false;
  await expect(caller().create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(state.insertedWhileMember).toEqual([]);
});

test("personal projects need no team membership", async () => {
  state.isMember = false;
  const project = await caller().create({ ...input, organizationId: null });
  expect(project).toMatchObject({ organizationId: null, userId: "user-1" });
});
