import { isAPIError } from "better-auth/api";
import { db } from "@/db/drizzle";
import { securityActivity, user } from "@/db/schema";
import { eq } from "drizzle-orm";

const SECURITY_ACTIVITY_ACTIONS = [
  "signed_in",
  "signed_out",
  "password_changed",
  "email_change_requested",
  "email_changed",
  "two_factor_enabled",
  "two_factor_disabled",
  "passkey_added",
  "passkey_removed",
  "session_revoked",
  "account_linked",
  "account_unlinked",
  "data_exported",
] as const;

export type SecurityActivityAction = (typeof SECURITY_ACTIVITY_ACTIONS)[number];

const PATH_ACTIONS: Array<{ prefix: string; action: SecurityActivityAction }> = [
  { prefix: "/sign-out", action: "signed_out" },
  { prefix: "/change-password", action: "password_changed" },
  // The address only changes once the new one is verified; that is logged from
  // emailVerification.afterEmailVerification in auth.ts.
  { prefix: "/change-email", action: "email_change_requested" },
  { prefix: "/two-factor/disable", action: "two_factor_disabled" },
  { prefix: "/passkey/verify-registration", action: "passkey_added" },
  { prefix: "/passkey/delete-passkey", action: "passkey_removed" },
  { prefix: "/revoke-session", action: "session_revoked" },
  { prefix: "/revoke-other-sessions", action: "session_revoked" },
  { prefix: "/revoke-sessions", action: "session_revoked" },
  { prefix: "/link-social", action: "account_linked" },
  { prefix: "/unlink-account", action: "account_unlinked" },
];

export async function recordSecurityActivity({
  userId,
  action,
  ipAddress,
  userAgent,
  metadata,
}: {
  userId: string;
  action: SecurityActivityAction;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(securityActivity).values({
    userId,
    action,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    metadata: metadata ?? {},
  });
}

export function securityActionForAuthPath(path: string): SecurityActivityAction | null {
  const match = PATH_ACTIONS.find(
    (entry) => path === entry.prefix || path.startsWith(`${entry.prefix}/`),
  );
  return match?.action ?? null;
}

type TwoFactorUser = Record<string, unknown> | null | undefined;

/**
 * Maps a finished Better Auth request to the security event it represents.
 *
 * Better Auth runs after hooks even when the endpoint failed (e.g. a wrong
 * current password), so only successful requests become events.
 */
export function securityActionForAuthResponse({
  path,
  returned,
  requestUser,
  issuedUser,
}: {
  path: string;
  returned: unknown;
  /** User of the session the request was made with. */
  requestUser?: TwoFactorUser;
  /** User of a session the endpoint issued while handling the request. */
  issuedUser?: TwoFactorUser;
}): SecurityActivityAction | null {
  if (isAPIError(returned) && returned.statusCode >= 400) return null;

  // /two-factor/enable only issues the TOTP secret; the first verified code turns
  // 2FA on. The same verify endpoint also completes 2FA sign-ins (no session yet).
  if (path === "/two-factor/verify-totp") {
    return requestUser?.twoFactorEnabled === false && issuedUser?.twoFactorEnabled === true
      ? "two_factor_enabled"
      : null;
  }

  return securityActionForAuthPath(path);
}

export async function isAnonymousUser(userId: string) {
  const [row] = await db
    .select({ isAnonymous: user.isAnonymous })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return Boolean(row?.isAnonymous);
}
