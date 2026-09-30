import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  assertSafePublicHttpUrl,
  fetchSafePublicHttpUrl,
  isBlockedHostnameLiteral,
  isPrivateIpAddress,
} from "./network-security";
import { fetchPageText } from "./chat-tools/fetch-page";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:http", () => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));

const lookup: (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupAddress[]> = dnsLookup;
const publicAnswer = [{ address: "8.8.8.8", family: 4 }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lookup).mockResolvedValue(publicAnswer);
});

describe("non-public IP detection", () => {
  test.each([
    "127.0.0.2",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.0.1",
    "172.16.0.1",
    "::1",
    "[::1]",
    "0:0:0:0:0:0:0:1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:7f00:1",
    "::ffff:a00:1",
    "::ffff:c0a8:1",
    "::ffff:ac10:1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "2001:db8::1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isPrivateIpAddress(address)).toBe(true);
  });

  test.each(["8.8.8.8", "::ffff:808:808", "::ffff:8.8.8.8", "2606:4700:4700::1111"])(
    "allows %s",
    (address) => expect(isPrivateIpAddress(address)).toBe(false),
  );

  test.each(["localhost.", "sub.localhost", "service.internal", "host.local"])(
    "blocks local hostname %s",
    (hostname) => expect(isBlockedHostnameLiteral(hostname)).toBe(true),
  );
});

test("rejects mapped IPv6 DNS answers and mixed public/private DNS", async () => {
  vi.mocked(lookup).mockResolvedValueOnce([{ address: "::ffff:7f00:1", family: 6 }]);
  await expect(assertSafePublicHttpUrl("http://probe.example/")).rejects.toThrow("Private network");
  vi.mocked(lookup).mockResolvedValueOnce([...publicAnswer, { address: "10.0.0.1", family: 4 }]);
  await expect(assertSafePublicHttpUrl("https://probe.example/")).rejects.toThrow(
    "Private network",
  );
  expect(httpRequest).not.toHaveBeenCalled();
});

test("rejects empty and failed DNS lookups", async () => {
  vi.mocked(lookup).mockResolvedValueOnce([]);
  await expect(assertSafePublicHttpUrl("https://probe.example/")).rejects.toThrow();
  vi.mocked(lookup).mockRejectedValueOnce(new Error("DNS failed"));
  await expect(assertSafePublicHttpUrl("https://probe.example/")).rejects.toThrow();
});

function respond(
  status: number,
  headers: Record<string, string>,
  body = "Readable public page ".repeat(10),
) {
  const incoming = Object.assign(Readable.from([Buffer.from(body)]), {
    statusCode: status,
    headers,
  });
  const outgoing = Object.assign(new EventEmitter(), { end: vi.fn() });
  outgoing.end.mockImplementation(() => {
    const [, , onResponse] = vi.mocked(httpRequest).mock.calls.at(-1)!;
    if (typeof onResponse === "function") onResponse(incoming as never);
  });
  vi.mocked(httpRequest).mockReturnValueOnce(outgoing as never);
}

test("pins socket DNS to validated addresses while preserving the HTTP hostname", async () => {
  respond(200, { "content-type": "text/plain" });
  const response = await fetchSafePublicHttpUrl("http://probe.example/path");
  const [url, options] = vi.mocked(httpRequest).mock.calls[0];
  expect(String(url)).toBe("http://probe.example/path");
  expect(options).toMatchObject({ agent: false });
  if (typeof options === "function" || !options?.lookup) throw new Error("Missing pinned lookup");
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
  const callback = vi.fn();
  options.lookup("probe.example", {}, callback);
  expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
  const allCallback = vi.fn();
  options.lookup("probe.example", { all: true }, allCallback);
  expect(allCallback).toHaveBeenCalledWith(null, publicAnswer, 4);
  expect(lookup).toHaveBeenCalledTimes(2);
  expect(await response.text()).toContain("Readable public page");
});

test("rejects DNS rebinding between validation and connection setup", async () => {
  vi.mocked(lookup)
    .mockResolvedValueOnce(publicAnswer)
    .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
  await expect(fetchSafePublicHttpUrl("https://probe.example/")).rejects.toThrow("Private network");
  expect(httpsRequest).not.toHaveBeenCalled();
});

test("rejects redirects to internal targets before opening a second socket", async () => {
  respond(302, { location: "http://127.0.0.1/private" });
  await expect(
    fetchPageText("http://probe.example/", { allowReaderFallback: false }),
  ).rejects.toThrow("Private network");
  expect(httpRequest).toHaveBeenCalledTimes(1);
});
