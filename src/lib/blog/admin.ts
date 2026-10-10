import { env } from "@/env";
import { getAdminEmails, parseAdminEmails } from "@/lib/admin-emails";

export function getBlogAdminEmails() {
  const dedicated = parseAdminEmails(env.BLOG_ADMIN_EMAILS);
  if (dedicated.size > 0) {
    return dedicated;
  }

  return getAdminEmails();
}

export function isBlogAdmin(email: string | null | undefined) {
  return Boolean(email && getBlogAdminEmails().has(email.trim().toLowerCase()));
}
