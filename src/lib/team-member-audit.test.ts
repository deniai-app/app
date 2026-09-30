import { beforeEach, expect, test, vi } from "vitest";
import { recordTeamAuditEvent, updateTeamSeatCount } from "@/lib/team-billing";
import { teamMemberAuditHooks, withTeamAuditActor } from "./team-member-audit";
import { POST } from "@/app/api/auth/[...all]/route";
import { organizationRouter } from "@/server/api/routers/organization";

const handler = vi.hoisted(() => ({ post: vi.fn(), session: vi.fn(), membership: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: handler.session } } }));
vi.mock("@/db/drizzle", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: handler.membership }) }) }) },
}));
vi.mock("@/lib/team-billing", () => ({
  recordTeamAuditEvent: vi.fn(),
  updateTeamSeatCount: vi.fn(),
}));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({ POST: handler.post, GET: vi.fn() }),
}));

const change = { member: { userId: "target", role: "member" }, organization: { id: "team" } };

beforeEach(() => {
  vi.resetAllMocks();
  handler.session.mockResolvedValue({ session: { userId: "real-actor" } });
  handler.membership.mockResolvedValue([{ role: "member" }]);
});

test("client-controlled audit mutations are not exposed", () => {
  const procedures = organizationRouter._def.procedures;
  expect(procedures).not.toHaveProperty("recordMemberRemoved");
  expect(procedures).not.toHaveProperty("recordMemberRoleChanged");
});

test("member changes fail closed without authenticated request context", async () => {
  await expect(teamMemberAuditHooks.beforeRemoveMember()).rejects.toThrow("audit context");
  await expect(teamMemberAuditHooks.beforeUpdateMemberRole()).rejects.toThrow("audit context");
  expect(recordTeamAuditEvent).not.toHaveBeenCalled();
});

test("successful role changes use the authenticated actor and server-provided roles", async () => {
  await withTeamAuditActor("admin", async () => {
    await teamMemberAuditHooks.beforeUpdateMemberRole();
    await teamMemberAuditHooks.afterUpdateMemberRole({ ...change, previousRole: "admin" });
  });
  expect(recordTeamAuditEvent).toHaveBeenCalledWith({
    organizationId: "team",
    actorUserId: "admin",
    targetUserId: "target",
    action: "member_role_updated",
    metadata: { previousRole: "admin", newRole: "member" },
  });
});

test("self-removal still records the original actor after membership disappears", async () => {
  await withTeamAuditActor("target", async () => {
    await teamMemberAuditHooks.beforeRemoveMember();
    await teamMemberAuditHooks.afterRemoveMember(change);
  });
  expect(recordTeamAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      actorUserId: "target",
      targetUserId: "target",
      action: "member_removed",
    }),
  );
  expect(updateTeamSeatCount).toHaveBeenCalledWith("team");
});

test("parallel auth requests never share audit actors", async () => {
  await Promise.all(
    ["actor-a", "actor-b"].map((actor) =>
      withTeamAuditActor(actor, async () => {
        await new Promise((resolve) => setTimeout(resolve, actor === "actor-a" ? 5 : 0));
        await teamMemberAuditHooks.afterRemoveMember({ ...change, organization: { id: actor } });
      }),
    ),
  );
  for (const actor of ["actor-a", "actor-b"])
    expect(recordTeamAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: actor, actorUserId: actor }),
    );
});

test("auth route binds actor from the session, never the submitted body", async () => {
  handler.post.mockImplementation(async () => {
    await teamMemberAuditHooks.beforeUpdateMemberRole();
    await teamMemberAuditHooks.afterUpdateMemberRole({ ...change, previousRole: "admin" });
    return new Response(null, { status: 200 });
  });
  await POST(
    new Request("http://localhost/api/auth/organization/update-member-role", {
      method: "POST",
      body: JSON.stringify({ actorUserId: "forged", previousRole: "owner" }),
    }),
  );
  expect(recordTeamAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      actorUserId: "real-actor",
      metadata: { previousRole: "admin", newRole: "member" },
    }),
  );
});

test("self-service leave records the authenticated departure and reconciles seats", async () => {
  handler.post.mockResolvedValue(new Response(null, { status: 200 }));
  await POST(
    new Request("http://localhost/api/auth/organization/leave", {
      method: "POST",
      body: JSON.stringify({ organizationId: "team", actorUserId: "forged" }),
    }),
  );
  expect(recordTeamAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      organizationId: "team",
      actorUserId: "real-actor",
      targetUserId: "real-actor",
      action: "member_removed",
      metadata: { role: "member", selfLeave: true },
    }),
  );
  expect(updateTeamSeatCount).toHaveBeenCalledWith("team");
});

test("rejected self-service leave does not log or reconcile seats", async () => {
  handler.post.mockResolvedValue(new Response(null, { status: 403 }));
  const response = await POST(
    new Request("http://localhost/api/auth/organization/leave", {
      method: "POST",
      body: JSON.stringify({ organizationId: "team" }),
    }),
  );
  expect(response.status).toBe(403);
  expect(recordTeamAuditEvent).not.toHaveBeenCalled();
  expect(updateTeamSeatCount).not.toHaveBeenCalled();
});

test("a denied auth mutation does not produce an audit event", async () => {
  handler.post.mockResolvedValue(new Response(null, { status: 403 }));
  const response = await POST(
    new Request("http://localhost/api/auth/organization/remove-member", { method: "POST" }),
  );
  expect(response.status).toBe(403);
  expect(recordTeamAuditEvent).not.toHaveBeenCalled();
});
