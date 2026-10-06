import { expect, test } from "vitest";
import { isWithinRedeliveryWindow, KEY_REDELIVERY_WINDOW_MS } from "./device-auth-key";

const now = new Date("2026-04-01T00:10:00Z");

test("a key issued moments ago can be redelivered", () => {
  expect(isWithinRedeliveryWindow(new Date(now.getTime() - 1_000), now)).toBe(true);
});

test("a key older than the window cannot", () => {
  expect(
    isWithinRedeliveryWindow(new Date(now.getTime() - KEY_REDELIVERY_WINDOW_MS - 1), now),
  ).toBe(false);
  expect(isWithinRedeliveryWindow(new Date(now.getTime() - KEY_REDELIVERY_WINDOW_MS), now)).toBe(
    false,
  );
});

test("a row with no issue time is never redeliverable", () => {
  expect(isWithinRedeliveryWindow(null, now)).toBe(false);
});
