import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { env } from "@/env";

/** The ingress proxy must overwrite client-supplied forwarding headers. */
export function anonymousAdViewerId(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const ip = (forwarded !== null ? forwarded.split(",")[0] : headers.get("x-real-ip"))?.trim();
  if (!ip || ip.includes("%") || !isIP(ip)) return undefined;

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
