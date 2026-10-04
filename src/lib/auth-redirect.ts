/**
 * Extract a Better Auth redirect response without allowing executable URL
 * schemes to reach a browser navigation sink.
 */
export function getAuthRedirectUrl(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;

  const record = data as { redirect?: unknown; url?: unknown };
  if (record.redirect !== true || typeof record.url !== "string" || !record.url.trim()) {
    return undefined;
  }

  try {
    const parsed = new URL(record.url, "https://deni-ai.invalid");
    if (["javascript:", "data:", "vbscript:"].includes(parsed.protocol)) return undefined;
  } catch {
    return undefined;
  }

  return record.url;
}

const REDIRECT_BASE = "https://deni-ai.invalid";

/**
 * Post-auth destinations come from the URL (`?redirectTo=`), so anyone can set
 * them. Allow only same-origin paths: absolute and protocol-relative URLs, and
 * backslash, tab or userinfo tricks that browsers resolve off-site, fall back.
 */
export function toSafeRedirectPath(value: string | null | undefined, fallback = "/chat") {
  const candidate = value?.trim();
  if (!candidate?.startsWith("/")) return fallback;

  try {
    const parsed = new URL(candidate, REDIRECT_BASE);
    if (parsed.origin !== REDIRECT_BASE) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
