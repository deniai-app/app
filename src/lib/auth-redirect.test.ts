import { expect, test } from "vitest";
import { getAuthRedirectUrl, toSafeRedirectPath } from "./auth-redirect";

test("keeps same-origin post-auth paths with their query and hash", () => {
  expect(toSafeRedirectPath("/chat")).toBe("/chat");
  expect(toSafeRedirectPath("/account/settings?error=TOKEN_EXPIRED#top")).toBe(
    "/account/settings?error=TOKEN_EXPIRED#top",
  );
});

test.each([
  "https://evil.example/login",
  "//evil.example",
  "/\\evil.example",
  "/\t/evil.example",
  "@evil.example",
  "javascript:alert(1)",
  "chat",
  "",
  null,
  undefined,
])("rejects %j as a post-auth destination", (value) => {
  expect(toSafeRedirectPath(value)).toBe("/chat");
  expect(toSafeRedirectPath(value, "/home")).toBe("/home");
});

test("OAuth continuations may still leave the origin, but never as script URLs", () => {
  expect(getAuthRedirectUrl({ redirect: true, url: "https://client.example/cb?code=1" })).toBe(
    "https://client.example/cb?code=1",
  );
  expect(getAuthRedirectUrl({ redirect: true, url: "javascript:alert(1)" })).toBeUndefined();
});
