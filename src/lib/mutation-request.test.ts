import { expect, test, vi } from "vitest";
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_BETTER_AUTH_URL: "https://app.example" } }));
import { guardMutationRequest } from "./mutation-request";

test.each(["https://attacker.example", "https://attacker.app.example", "null"])(
  "rejects the origin %s",
  (origin) => {
    expect(
      guardMutationRequest(new Request("https://app.example", { headers: { origin } }))?.status,
    ).toBe(403);
  },
);
test.each(["same-site", "cross-site"])("rejects %s requests even when Origin is absent", (site) => {
  expect(
    guardMutationRequest(
      new Request("https://app.example", { headers: { "sec-fetch-site": site } }),
    )?.status,
  ).toBe(403);
});
test("allows same-origin JSON and explicit non-browser JSON clients", () => {
  for (const origin of [null, "https://app.example"]) {
    const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
    if (origin) headers.set("origin", origin);
    expect(
      guardMutationRequest(new Request("https://app.example", { headers }), "application/json"),
    ).toBeNull();
  }
});
