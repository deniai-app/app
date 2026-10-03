import { isIP } from "node:net";
import { z } from "zod";

export const adVariantSchema = z.strictObject({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(240),
});

export const adCreativeSchema = z.strictObject({
  defaultLanguage: z.enum(["ja", "en"]).nullable(),
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(240),
  japaneseVariant: adVariantSchema.nullable(),
  englishVariant: adVariantSchema.nullable(),
  url: z
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        url.hostname.includes(".") &&
        !isIP(url.hostname) &&
        !url.hostname.endsWith(".local")
      );
    }),
});

export const adLanguages = ["ja", "en"] as const;
export type AdLanguage = (typeof adLanguages)[number];

export const adTargetLanguagesSchema = z
  .array(z.enum(adLanguages))
  .min(1)
  .max(adLanguages.length)
  .refine((languages) => new Set(languages).size === languages.length)
  .transform((languages) => adLanguages.filter((language) => languages.includes(language)));

// Old campaigns can have both variants and no recorded default language.
export function hasOnlyOppositeVariant(input: z.infer<typeof adCreativeSchema>) {
  return (
    input.defaultLanguage !== null &&
    (input.defaultLanguage === "ja"
      ? input.japaneseVariant === null
      : input.englishVariant === null)
  );
}

export const submittedAdCreativeSchema = adCreativeSchema.refine(hasOnlyOppositeVariant);
