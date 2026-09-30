import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { env } from "@/env";
import { isAllowedAdClickOrigin, isAllowedAdOrigin } from "./ad-origin";

const publicOrigin = new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin;

function request(origin?: string, url = "http://internal-proxy:3000/api/ads/campaigns") {
  return new Request(url, { headers: origin ? { origin } : {} });
}

describe("ad click origin", () => {
  function clickRequest(referer?: string, site = "same-origin") {
    return new Request("http://internal-proxy:3000/api/ads/click", {
      headers: { "sec-fetch-site": site, ...(referer ? { referer } : {}) },
    });
  }

  test("accepts public-origin clicks behind an internal proxy", () => {
    assert.equal(isAllowedAdClickOrigin(clickRequest(`${publicOrigin}/chat/123`)), true);
    assert.equal(isAllowedAdClickOrigin(clickRequest(`${publicOrigin}/`)), true);
  });

  test("rejects missing, malformed, and foreign referrers", () => {
    for (const referer of [
      undefined,
      "not a URL",
      "https://other.example/chat",
      "http://internal-proxy:3000/chat",
      `${publicOrigin}.evil.example/chat`,
      `${publicOrigin}@evil.example/chat`,
    ]) {
      assert.equal(isAllowedAdClickOrigin(clickRequest(referer)), false);
    }
  });

  test("requires same-origin fetch metadata even with a public referrer", () => {
    for (const site of ["cross-site", "same-site", "none", ""]) {
      assert.equal(isAllowedAdClickOrigin(clickRequest(`${publicOrigin}/chat`, site)), false);
    }
  });
});

describe("ad request origin", () => {
  test("accepts the configured public origin behind an internal proxy", () => {
    assert.equal(isAllowedAdOrigin(request(publicOrigin)), true);
  });

  test("rejects other and missing origins, even when the request URL matches", () => {
    assert.equal(isAllowedAdOrigin(request()), false);
    assert.equal(isAllowedAdOrigin(request("https://other.example")), false);
    assert.equal(
      isAllowedAdOrigin(request("https://other.example", "https://other.example/api/ads")),
      false,
    );
  });
});
