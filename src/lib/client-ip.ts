import { isIP } from "node:net";
import { env } from "@/env";

export type ClientIpOptions = {
  /** Single-value header set by the trusted edge (e.g. `cf-connecting-ip`); used exclusively. */
  header?: string;
  /** Number of trusted proxies that append to `X-Forwarded-For`. */
  trustedProxyHops?: number;
};

/** Deployment config from `CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` (see SETUP.md). */
export function clientIpOptionsFromEnv(): ClientIpOptions {
  return { header: env.CLIENT_IP_HEADER, trustedProxyHops: env.TRUSTED_PROXY_HOPS };
}

function validIp(value: string | null | undefined): string | undefined {
  const ip = value?.trim();
  // Zone IDs (fe80::1%eth0) are never a remote client address.
  return ip && !ip.includes("%") && isIP(ip) ? ip : undefined;
}

/**
 * Resolves the client IP, or undefined when no valid address is available.
 *
 * - `header`: only that header, which must hold exactly one IP.
 * - `trustedProxyHops`: the `X-Forwarded-For` entry that many positions from the
 *   right; entries further left are client-controlled and ignored.
 * - Neither (legacy default): the first `X-Forwarded-For` entry, else `X-Real-IP`.
 *   Clients can spoof this unless the edge overwrites both headers.
 */
export function resolveClientIp(
  headers: Pick<Headers, "get">,
  options: ClientIpOptions = clientIpOptionsFromEnv(),
): string | undefined {
  if (options.header) return validIp(headers.get(options.header));

  const forwarded = headers.get("x-forwarded-for");
  const hops = options.trustedProxyHops;
  if (hops) {
    if (forwarded === null) return undefined;
    // Do not drop empty entries: that could shift a client-controlled value into place.
    const chain = forwarded.split(",");
    return chain.length < hops ? undefined : validIp(chain[chain.length - hops]);
  }

  return validIp(forwarded !== null ? forwarded.split(",")[0] : headers.get("x-real-ip"));
}
