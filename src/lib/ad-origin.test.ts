import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { env } from "@/env";
import { isAllowedAdOrigin } from "./ad-origin";

const publicOrigin = new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin;

function request(origin?: string, url = "http://internal-proxy:3000/api/ads/campaigns") {
  return new Request(url, { headers: origin ? { origin } : {} });
}

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
