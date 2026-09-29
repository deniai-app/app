import type { z } from "zod";
import type { adCreativeSchema } from "@/lib/ad-creative";

type Creative = z.infer<typeof adCreativeSchema>;
type StoredCreative = {
  title: string;
  description: string;
  url: string;
  defaultLanguage: "ja" | "en" | null;
  japaneseTitle: string | null;
  japaneseDescription: string | null;
  englishTitle: string | null;
  englishDescription: string | null;
};

export function creativeFields(creative: Creative) {
  return {
    title: creative.title,
    description: creative.description,
    url: creative.url,
    defaultLanguage: creative.defaultLanguage,
    japaneseTitle: creative.japaneseVariant?.title ?? null,
    japaneseDescription: creative.japaneseVariant?.description ?? null,
    englishTitle: creative.englishVariant?.title ?? null,
    englishDescription: creative.englishVariant?.description ?? null,
  };
}

export function storedCreative(ad: StoredCreative): Creative {
  return {
    title: ad.title,
    description: ad.description,
    url: ad.url,
    defaultLanguage: ad.defaultLanguage,
    japaneseVariant:
      ad.japaneseTitle && ad.japaneseDescription
        ? { title: ad.japaneseTitle, description: ad.japaneseDescription }
        : null,
    englishVariant:
      ad.englishTitle && ad.englishDescription
        ? { title: ad.englishTitle, description: ad.englishDescription }
        : null,
  };
}

export function sameCreative(a: Creative, b: Creative) {
  return JSON.stringify(creativeFields(a)) === JSON.stringify(creativeFields(b));
}

export function localizedCreative(ad: StoredCreative, locale: string) {
  const variant =
    locale === "ja"
      ? ad.defaultLanguage === "ja"
        ? null
        : storedCreative(ad).japaneseVariant
      : ad.defaultLanguage === "en"
        ? null
        : storedCreative(ad).englishVariant;
  return variant ?? { title: ad.title, description: ad.description };
}
