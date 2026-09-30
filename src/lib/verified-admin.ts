export type AdminUser =
  | { email?: string | null; emailVerified?: boolean; isAnonymous?: boolean | null }
  | null
  | undefined;

/** Email allowlists confer privileges only after mailbox ownership is proved. */
export function isVerifiedAdmin(
  user: AdminUser,
  isAllowedEmail: (email: string | null | undefined) => boolean,
) {
  return Boolean(
    user && user.emailVerified === true && !user.isAnonymous && isAllowedEmail(user.email),
  );
}
