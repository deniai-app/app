import { env } from "@/env";

export function parseAdminEmails(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Operator allowlist (reset-credit grants, dispute alerts, blog fallback).
 * `AFFILIATE_ADMIN_EMAILS` is the name from before the affiliate program was
 * removed; it is still read so existing deployments keep their admins.
 */
export function getAdminEmails() {
  return parseAdminEmails(env.ADMIN_EMAILS ?? env.AFFILIATE_ADMIN_EMAILS);
}

export function isAdminEmail(email: string | null | undefined) {
  return Boolean(email && getAdminEmails().has(email.trim().toLowerCase()));
}
