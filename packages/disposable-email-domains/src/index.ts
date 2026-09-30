import domains from "../data/domains.json";

/**
 * Set of disposable email domains, sourced from
 * https://github.com/disposable-email-domains/disposable-email-domains
 * (blocklist minus allowlist). Refresh with `pnpm run refresh` in this package.
 */
export const disposableDomains: ReadonlySet<string> = new Set(domains as string[]);

/** Returns true when the given bare domain (e.g. `mailinator.com`) is disposable. */
export function isDisposableDomain(domain: string): boolean {
  return disposableDomains.has(domain.trim().toLowerCase());
}

/** Returns true when the email's domain is on the disposable blocklist. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  return isDisposableDomain(email.slice(at + 1));
}
