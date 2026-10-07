import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { db as Db } from "@/db/drizzle";
import { member, organization, projects } from "@/db/schema";

export type AccessibleProject = typeof projects.$inferSelect & {
  organizationName: string | null;
  canManage: boolean;
};

/** Evaluate membership against the current project row in the same database statement. */
export function currentProjectAccessWhere(userId: string) {
  return or(
    and(eq(projects.userId, userId), isNull(projects.organizationId)),
    sql`exists (select 1 from ${member} where ${member.organizationId} = ${projects.organizationId} and ${member.userId} = ${userId})`,
  );
}

export function currentProjectManagementWhere(userId: string) {
  return or(
    and(eq(projects.userId, userId), isNull(projects.organizationId)),
    sql`exists (select 1 from ${member}
      where ${member.organizationId} = ${projects.organizationId}
        and ${member.userId} = ${userId}
        and (${projects.userId} = ${userId} or ${member.role} in ('owner', 'admin')))`,
  );
}

export async function listUserMemberships(database: typeof Db, userId: string) {
  return database
    .select({
      organizationId: member.organizationId,
      role: member.role,
      organizationName: organization.name,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
}

function canManageWithRole(
  project: { userId: string; organizationId: string | null },
  userId: string,
  role: string | undefined,
) {
  if (!project.organizationId) {
    return project.userId === userId;
  }
  if (project.userId === userId) {
    return true;
  }
  return role === "owner" || role === "admin";
}

export function projectAccessWhere(
  userId: string,
  organizationIds: string[],
  includeArchived: boolean,
) {
  const personal = and(eq(projects.userId, userId), isNull(projects.organizationId));
  const team =
    organizationIds.length > 0 ? inArray(projects.organizationId, organizationIds) : undefined;
  return and(or(personal, team), includeArchived ? undefined : isNull(projects.archivedAt));
}

export async function getAccessibleProject(
  database: typeof Db,
  userId: string,
  projectId: string,
): Promise<AccessibleProject | null> {
  const [project] = await database
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    return null;
  }

  if (!project.organizationId) {
    if (project.userId !== userId) {
      return null;
    }
    return { ...project, organizationName: null, canManage: true };
  }

  const [membership] = await database
    .select({
      role: member.role,
      organizationName: organization.name,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.organizationId, project.organizationId), eq(member.userId, userId)))
    .limit(1);

  if (!membership) {
    return null;
  }

  return {
    ...project,
    organizationName: membership.organizationName,
    canManage: canManageWithRole(project, userId, membership.role),
  };
}

export async function userIsOrgMember(database: typeof Db, userId: string, organizationId: string) {
  const [row] = await database
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export function withProjectAccess(
  project: typeof projects.$inferSelect,
  userId: string,
  memberships: Array<{ organizationId: string; role: string; organizationName: string }>,
): AccessibleProject | null {
  if (!project.organizationId) {
    if (project.userId !== userId) {
      return null;
    }
    return { ...project, organizationName: null, canManage: true };
  }

  const membership = memberships.find((entry) => entry.organizationId === project.organizationId);
  if (!membership) {
    return null;
  }

  return {
    ...project,
    organizationName: membership.organizationName,
    canManage: canManageWithRole(project, userId, membership.role),
  };
}
