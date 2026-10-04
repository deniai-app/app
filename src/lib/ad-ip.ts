import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { resolveClientIp, type ClientIpOptions } from "@/lib/client-ip";
import { env } from "@/env";

/** Client IP resolution follows `CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` (see SETUP.md). */
export function anonymousAdViewerId(
  headers: Pick<Headers, "get">,
  options?: ClientIpOptions,
): string | undefined {
  const ip = resolveClientIp(headers, options);
  if (!ip) return undefined;

  // Canonicalize IPv6 spellings and IPv4-mapped IPv6 so they cannot evade deduplication.
  let normalized = isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip;
  if (normalized.startsWith("::ffff:")) {
    const parts = normalized.slice(7).split(":");
    if (parts.length === 2) {
      const high = parseInt(parts[0], 16);
      const low = parseInt(parts[1], 16);
      normalized = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
  }

  // Never store or expose the raw IP; namespace separately from account IDs.
  return `ip:${createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`deni-ads-ip:${normalized}`)
    .digest("hex")}`;
}
