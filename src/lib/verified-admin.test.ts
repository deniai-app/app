import { expect, test, vi } from "vitest";
import { isVerifiedAdmin } from "./verified-admin";

const allow = (email: string | null | undefined) => email === "admin@example.com";

test.each([
  undefined,
  null,
  {},
  { email: "admin@example.com", emailVerified: false },
  { email: "admin@example.com" },
  { email: "admin@example.com", emailVerified: true, isAnonymous: true },
  { email: "other@example.com", emailVerified: true },
])("privileged email grants fail closed for %j", (user) => {
  expect(isVerifiedAdmin(user, allow)).toBe(false);
});
test("verified permanent allowlisted accounts retain administration", () => {
  expect(
    isVerifiedAdmin({ email: "admin@example.com", emailVerified: true, isAnonymous: null }, allow),
  ).toBe(true);
});
test("unverified accounts never reach the allowlist grant", () => {
  const predicate = vi.fn(() => true);
  expect(isVerifiedAdmin({ email: "admin@example.com", emailVerified: false }, predicate)).toBe(
    false,
  );
  expect(predicate).not.toHaveBeenCalled();
});
