import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { normalizeAdReview } from "./ad-review";

describe("ad review decisions", () => {
  test("an ordinary slogan or comparative claim cannot be rejected by a free-form reason alone", () => {
    assert.deepEqual(
      normalizeAdReview({ category: "none", reason: "Unverified comparative claim" }),
      {
        approved: true,
        reason: "",
      },
    );
  });

  test("an explicitly prohibited category blocks publication", () => {
    assert.deepEqual(normalizeAdReview({ category: "scam_or_phishing", reason: "Phishing" }), {
      approved: false,
      reason: "Phishing",
    });
  });
});
