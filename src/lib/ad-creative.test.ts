import assert from "node:assert/strict";
import { test } from "vitest";
import {
  adCreativeSchema,
  adTargetLanguagesSchema,
  submittedAdCreativeSchema,
} from "./ad-creative";

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

test("target languages require a unique, non-empty selection", () => {
  assert.deepEqual(adTargetLanguagesSchema.parse(["en", "ja"]), ["ja", "en"]);
  assert.deepEqual(adTargetLanguagesSchema.parse(["en"]), ["en"]);
  assert.equal(adTargetLanguagesSchema.safeParse([]).success, false);
  assert.equal(adTargetLanguagesSchema.safeParse(["en", "en"]).success, false);
  assert.equal(adTargetLanguagesSchema.safeParse(["fr"]).success, false);
});
