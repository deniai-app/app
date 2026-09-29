import assert from "node:assert/strict";
import { test } from "node:test";
import { adCreativeSchema } from "./ad-creative";
import { creativeFields, localizedCreative, sameCreative, storedCreative } from "./ad-variants";

const creative = {
  title: "Default title",
  description: "Default description",
  url: "https://example.com",
  defaultLanguage: null,
  japaneseVariant: { title: "日本語の広告", description: "日本語で書かれた説明文です" },
  englishVariant: { title: "English title", description: "English description" },
};

test("language variants are optional but must be complete and valid", () => {
  assert.equal(adCreativeSchema.safeParse({ ...creative, japaneseVariant: null }).success, true);
  assert.equal(
    adCreativeSchema.safeParse({ ...creative, japaneseVariant: { title: "Hello" } }).success,
    false,
  );
  assert.equal(
    adCreativeSchema.safeParse({
      ...creative,
      englishVariant: { title: "x", description: "Too short" },
    }).success,
    false,
  );
});

test("stored variants are selected by locale with default fallback", () => {
  const stored = creativeFields(creative);
  assert.deepEqual(storedCreative(stored), creative);
  assert.equal(sameCreative(storedCreative(stored), adCreativeSchema.parse(creative)), true);
  assert.equal(sameCreative(storedCreative(stored), { ...creative, japaneseVariant: null }), false);
  assert.deepEqual(localizedCreative(stored, "ja"), creative.japaneseVariant);
  assert.deepEqual(localizedCreative(stored, "en"), creative.englishVariant);
  assert.deepEqual(localizedCreative({ ...stored, defaultLanguage: "ja" }, "ja"), {
    title: creative.title,
    description: creative.description,
  });
  assert.deepEqual(localizedCreative({ ...stored, defaultLanguage: "en" }, "en"), {
    title: creative.title,
    description: creative.description,
  });
  assert.deepEqual(
    localizedCreative({ ...stored, japaneseTitle: null, japaneseDescription: null }, "ja"),
    {
      title: creative.title,
      description: creative.description,
    },
  );
});
