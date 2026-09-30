import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { withTeamAuditActor, withTeamLeaveAudit } from "@/lib/team-member-audit";

const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;

export async function POST(request: Request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (
    !path.endsWith("/organization/remove-member") &&
    !path.endsWith("/organization/update-member-role") &&
    !path.endsWith("/organization/leave")
  ) {
    return handlers.POST(request);
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.session.userId;
  return withTeamAuditActor(userId, () =>
    path.endsWith("/organization/leave")
      ? withTeamLeaveAudit(request, userId, () => handlers.POST(request))
      : handlers.POST(request),
  );
}
