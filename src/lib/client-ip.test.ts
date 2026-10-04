import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveClientIp, type ClientIpOptions } from "./client-ip";

const resolve = (init: Record<string, string>, options: ClientIpOptions = {}) =>
  resolveClientIp(new Headers(init), options);

describe("legacy default (no config)", () => {
  test("uses the first X-Forwarded-For entry, else X-Real-IP", () => {
    expect(resolve({ "x-forwarded-for": " 192.0.2.1 , 10.0.0.1" })).toBe("192.0.2.1");
    expect(resolve({ "x-real-ip": "2001:db8::1" })).toBe("2001:db8::1");
    expect(resolve({})).toBeUndefined();
  });

  test("does not fall back to X-Real-IP when X-Forwarded-For is present but invalid", () => {
    expect(resolve({ "x-forwarded-for": "unknown", "x-real-ip": "192.0.2.1" })).toBeUndefined();
    expect(resolve({ "x-forwarded-for": "", "x-real-ip": "192.0.2.1" })).toBeUndefined();
  });

  test("rejects invalid addresses and zone IDs", () => {
    for (const ip of ["not-an-ip", "192.0.2.1:1234", "[::1]", "fe80::1%eth0", "999.0.0.1"]) {
      expect(resolve({ "x-forwarded-for": ip })).toBeUndefined();
    }
  });
});

describe("CLIENT_IP_HEADER", () => {
  const options = { header: "cf-connecting-ip" };

  test("uses only the configured header", () => {
    expect(
      resolve({ "cf-connecting-ip": " 203.0.113.7 ", "x-forwarded-for": "198.51.100.1" }, options),
    ).toBe("203.0.113.7");
    expect(resolve({ "CF-Connecting-IP": "2001:db8::2" }, options)).toBe("2001:db8::2");
  });

  test("never falls back to X-Forwarded-For or X-Real-IP", () => {
    expect(
      resolve({ "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2" }, options),
    ).toBeUndefined();
  });

  test("requires exactly one valid IP", () => {
    expect(resolve({ "cf-connecting-ip": "203.0.113.7, 198.51.100.1" }, options)).toBeUndefined();
    expect(resolve({ "cf-connecting-ip": "spoofed" }, options)).toBeUndefined();
  });

  test("takes precedence over TRUSTED_PROXY_HOPS", () => {
    expect(
      resolve(
        { "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 198.51.100.2" },
        { header: "x-real-ip", trustedProxyHops: 1 },
      ),
    ).toBe("203.0.113.7");
  });
});

describe("TRUSTED_PROXY_HOPS", () => {
  test("picks the entry appended by the outermost trusted proxy", () => {
    // Client spoofs the leftmost entries; one trusted proxy appends the real peer.
    const spoofed = { "x-forwarded-for": "1.1.1.1, 8.8.8.8, 203.0.113.7" };
    expect(resolve(spoofed, { trustedProxyHops: 1 })).toBe("203.0.113.7");
    expect(resolve({ "x-forwarded-for": "203.0.113.7" }, { trustedProxyHops: 1 })).toBe(
      "203.0.113.7",
    );
    // Two appending proxies: edge appends the client, the inner proxy appends the edge.
    expect(
      resolve({ "x-forwarded-for": "1.1.1.1, 203.0.113.7, 10.0.0.2" }, { trustedProxyHops: 2 }),
    ).toBe("203.0.113.7");
  });

  test("returns undefined when the chain is shorter than the hop count", () => {
    expect(resolve({ "x-forwarded-for": "203.0.113.7" }, { trustedProxyHops: 2 })).toBeUndefined();
  });

  test("ignores X-Real-IP and needs X-Forwarded-For", () => {
    expect(resolve({ "x-real-ip": "203.0.113.7" }, { trustedProxyHops: 1 })).toBeUndefined();
  });

  test("does not skip empty entries to reach a client-controlled value", () => {
    expect(resolve({ "x-forwarded-for": "1.1.1.1, " }, { trustedProxyHops: 1 })).toBeUndefined();
    expect(resolve({ "x-forwarded-for": ", 203.0.113.7" }, { trustedProxyHops: 1 })).toBe(
      "203.0.113.7",
    );
  });
});

describe("env wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadWithEnv(values: Record<string, string>) {
    for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
    vi.resetModules();
    return import("./client-ip");
  }

  test("treats empty values as unset (legacy default)", async () => {
    const mod = await loadWithEnv({ CLIENT_IP_HEADER: "", TRUSTED_PROXY_HOPS: "" });
    expect(mod.clientIpOptionsFromEnv()).toEqual({
      header: undefined,
      trustedProxyHops: undefined,
    });
    expect(mod.resolveClientIp(new Headers({ "x-forwarded-for": "192.0.2.1, 10.0.0.1" }))).toBe(
      "192.0.2.1",
    );
  });

  test("normalizes CLIENT_IP_HEADER and parses TRUSTED_PROXY_HOPS", async () => {
    const mod = await loadWithEnv({
      CLIENT_IP_HEADER: " CF-Connecting-IP ",
      TRUSTED_PROXY_HOPS: "2",
    });
    expect(mod.clientIpOptionsFromEnv()).toEqual({
      header: "cf-connecting-ip",
      trustedProxyHops: 2,
    });
    expect(
      mod.resolveClientIp(
        new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "192.0.2.1" }),
      ),
    ).toBe("203.0.113.7");
  });

  test("uses TRUSTED_PROXY_HOPS from env by default", async () => {
    const mod = await loadWithEnv({ TRUSTED_PROXY_HOPS: "1" });
    expect(mod.resolveClientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  test("rejects invalid values at startup", async () => {
    await expect(loadWithEnv({ TRUSTED_PROXY_HOPS: "0" })).rejects.toThrow();
    await expect(loadWithEnv({ TRUSTED_PROXY_HOPS: "two" })).rejects.toThrow();
    await expect(loadWithEnv({ CLIENT_IP_HEADER: "cf connecting ip" })).rejects.toThrow();
  });
});
