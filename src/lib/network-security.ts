import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

function unbracketHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "");
}

/**
 * Non-public IPv4 ranges, as CIDR pairs of [network, prefix length].
 *
 * Matching on numeric ranges rather than string prefixes matters: a
 * `startsWith("127.0.0.1")`-style check only covers a single loopback address and
 * leaves the rest of 127.0.0.0/8 (127.0.0.2, 127.1.1.1, …) reachable.
 */
const PRIVATE_IPV4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // RFC 6598 carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. 255.255.255.255 broadcast
];

function ipv4ToInt(address: string) {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }

  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    value = value * 256 + octet;
  }
  return value;
}

function isPrivateIpv4(address: string) {
  const value = ipv4ToInt(address);
  if (value === null) {
    return true; // Unparseable: fail closed.
  }

  return PRIVATE_IPV4_CIDRS.some(([network, prefix]) => {
    const networkValue = ipv4ToInt(network);
    if (networkValue === null) {
      return false;
    }
    // Avoid <<: a /0 shift is undefined-ish in JS bitwise ops and 32-bit signed
    // arithmetic would break for addresses above 127.x.
    const blockSize = 2 ** (32 - prefix);
    return Math.floor(value / blockSize) === Math.floor(networkValue / blockSize);
  });
}

function isPrivateIpv6(address: string) {
  // URL canonicalization converts dotted mapped addresses and expanded forms
  // into the same hexadecimal representation before range checks.
  const normalized = unbracketHostname(new URL(`http://[${address}]/`).hostname);
  const [left, right] = normalized.split("::");
  const head = left ? left.split(":") : [];
  const tail = right ? right.split(":") : [];
  const blocks = (
    right !== undefined
      ? [...head, ...Array<string>(8 - head.length - tail.length).fill("0"), ...tail]
      : head
  ).map((part) => Number.parseInt(part, 16));

  if (blocks.slice(0, 5).every((part) => part === 0) && blocks[5] === 0xffff) {
    const ipv4 = [blocks[6] >> 8, blocks[6] & 255, blocks[7] >> 8, blocks[7] & 255].join(".");
    return isPrivateIpv4(ipv4);
  }

  // Only global unicast (2000::/3). Exclude special assignments, documentation,
  // and transition mechanisms that can embed a non-public IPv4 destination.
  return (
    (blocks[0] & 0xe000) !== 0x2000 ||
    (blocks[0] === 0x2001 && blocks[1] < 0x0200) ||
    (blocks[0] === 0x2001 && blocks[1] === 0x0db8) ||
    blocks[0] === 0x2002 ||
    (blocks[0] === 0x3fff && (blocks[1] & 0xf000) === 0)
  );
}

export function isPrivateIpAddress(address: string) {
  const normalized = unbracketHostname(address).toLowerCase();
  const version = isIP(normalized);

  if (version === 4) {
    return isPrivateIpv4(normalized);
  }

  if (version === 6) {
    return isPrivateIpv6(normalized);
  }

  return true; // Invalid DNS answers must fail closed.
}

export function isBlockedHostnameLiteral(hostname: string) {
  const normalized = unbracketHostname(hostname.trim().toLowerCase()).replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".local") ||
    (isIP(normalized) !== 0 && isPrivateIpAddress(normalized))
  );
}

export async function normalizePublicBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    if (parsed.username || parsed.password) {
      return null;
    }

    if (await resolvesToPrivateNetwork(parsed.hostname)) {
      return null;
    }

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export async function resolvesToPrivateNetwork(hostname: string) {
  if (isBlockedHostnameLiteral(hostname)) {
    return true;
  }

  try {
    const addresses = await lookup(unbracketHostname(hostname), { all: true, verbatim: true });
    return addresses.length === 0 || addresses.some((entry) => isPrivateIpAddress(entry.address));
  } catch {
    return true;
  }
}

export async function assertSafePublicHttpUrl(url: string) {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS URLs are allowed.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Credentialed URLs are not allowed.");
  }

  if (await resolvesToPrivateNetwork(parsed.hostname)) {
    throw new Error("Private network URLs are not allowed.");
  }

  return parsed;
}

/** A GET whose socket uses only the DNS answers that were validated here. */
export async function fetchSafePublicHttpUrl(
  url: string,
  options: { headers?: HeadersInit; signal?: AbortSignal } = {},
): Promise<Response> {
  const parsed = await assertSafePublicHttpUrl(url);
  const hostname = unbracketHostname(parsed.hostname);
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error("Private network URLs are not allowed.");
  }
  const address = addresses[0];
  const headers = Object.fromEntries(new Headers(options.headers));
  headers["accept-encoding"] = "identity";

  return new Promise((resolve, reject) => {
    const request = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const outgoing = request(
      parsed,
      {
        headers,
        signal: options.signal,
        // No pooled socket or second DNS lookup can escape the validated set.
        agent: false,
        lookup: (_hostname, lookupOptions, callback) =>
          callback(null, lookupOptions.all ? addresses : address.address, address.family),
      },
      (incoming) => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) {
            responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
          }
        }
        const status = incoming.statusCode ?? 502;
        if (status === 204 || status === 205 || status === 304) {
          incoming.resume();
          resolve(new Response(null, { status, headers: responseHeaders }));
          return;
        }
        resolve(
          new Response(
            Readable.toWeb(incoming, {
              strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength },
            }) as ReadableStream<Uint8Array>,
            {
              status,
              headers: responseHeaders,
            },
          ),
        );
      },
    );
    outgoing.on("error", reject);
    outgoing.end();
  });
}
