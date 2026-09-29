import assert from "node:assert/strict";
import { test } from "node:test";
import { adCreativeSchema, submittedAdCreativeSchema } from "./ad-creative";

const creative = {
  title: "Sample ad",
  description: "A useful product for everyday work",
  url: "https://example.com/product",
  defaultLanguage: "ja" as const,
  japaneseVariant: null,
  englishVariant: null,
};

test("edited creatives accept safe HTTPS destinations", () => {
  assert.equal(adCreativeSchema.safeParse(creative).success, true);
});

test("only the opposite-language variant is accepted for new creatives", () => {
  assert.equal(submittedAdCreativeSchema.safeParse(creative).success, true);
  assert.equal(
    submittedAdCreativeSchema.safeParse({ ...creative, defaultLanguage: null }).success,
    false,
  );
  assert.equal(
    submittedAdCreativeSchema.safeParse({
      ...creative,
      japaneseVariant: { title: "日本語の広告", description: "日本語で書かれた説明文です" },
    }).success,
    false,
  );
  assert.equal(
    submittedAdCreativeSchema.safeParse({
      ...creative,
      englishVariant: { title: "English title", description: "English description" },
    }).success,
    true,
  );
});

test("editing cannot include price or budget and rejects unsafe URLs", () => {
  assert.equal(adCreativeSchema.safeParse({ ...creative, budgetYen: 1 }).success, false);
  assert.equal(
    adCreativeSchema.safeParse({ ...creative, url: "http://example.com" }).success,
    false,
  );
  assert.equal(
    adCreativeSchema.safeParse({ ...creative, url: "https://localhost/private" }).success,
    false,
  );
  assert.equal(
    adCreativeSchema.safeParse({ ...creative, url: "https://127.0.0.1/" }).success,
    false,
  );
});
