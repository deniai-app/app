import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { member } from "@/db/schema";
import { recordTeamAuditEvent, updateTeamSeatCount } from "@/lib/team-billing";

const auditActor = new AsyncLocalStorage<string>();

export function withTeamAuditActor<T>(userId: string | undefined, run: () => T): T {
  // Never infer the actor from the target member or from client-supplied IDs.
  return auditActor.run(userId ?? "", run);
}

function requireAuditActor(): string {
  const userId = auditActor.getStore();
  if (!userId) throw new Error("Authenticated team audit context is required.");
  return userId;
}

type MemberChange = {
  member: { userId: string; role: string };
  organization: { id: string };
};

/** Better Auth's leave endpoint bypasses its remove-member hooks. */
export async function withTeamLeaveAudit(
  request: Request,
  userId: string | undefined,
  run: () => Promise<Response>,
) {
  if (!userId) return run();
  const body = (await request
    .clone()
    .json()
    .catch(() => null)) as { organizationId?: unknown } | null;
  if (typeof body?.organizationId !== "string") return run();
  const organizationId = body.organizationId;
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  const response = await run();
  // Only the authenticated framework mutation can authorize a successful leave.
  if (response.ok && membership) {
    await recordTeamAuditEvent({
      organizationId,
      actorUserId: userId,
      targetUserId: userId,
      action: "member_removed",
      metadata: { role: membership.role, selfLeave: true },
    });
    await updateTeamSeatCount(organizationId);
  }
  return response;
}

/** Called only by better-auth after it has authorized and performed the mutation. */
export const teamMemberAuditHooks = {
  beforeRemoveMember: async () => {
    requireAuditActor();
  },
  beforeUpdateMemberRole: async () => {
    requireAuditActor();
  },
  afterRemoveMember: async ({ member, organization }: MemberChange) => {
    await recordTeamAuditEvent({
      organizationId: organization.id,
      actorUserId: requireAuditActor(),
      targetUserId: member.userId,
      action: "member_removed",
      metadata: { role: member.role },
    });
    await updateTeamSeatCount(organization.id);
  },
  afterUpdateMemberRole: async ({
    member,
    organization,
    previousRole,
  }: MemberChange & { previousRole: string }) => {
    await recordTeamAuditEvent({
      organizationId: organization.id,
      actorUserId: requireAuditActor(),
      targetUserId: member.userId,
      action: "member_role_updated",
      metadata: { previousRole, newRole: member.role },
    });
  },
};
