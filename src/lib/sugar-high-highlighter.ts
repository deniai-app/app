import { highlight, type LanguageName } from "sugar-high";
import { lang, languages } from "sugar-high/lang";

const MAX_CACHE_ENTRIES = 80;

const cache = new Map<string, string>();

const canonicalNames = languages.map((entry) => entry.id);

export const supportedHighlightLanguages: string[] = [
  ...canonicalNames,
  ...languages.flatMap((entry) => [entry.extension, ...entry.aliases]),
];

const supportedLanguageSet = new Set(supportedHighlightLanguages.map((name) => name.toLowerCase()));

export function isHighlightLanguage(language: string): boolean {
  const key = language.trim().toLowerCase();
  return (
    key.length === 0 ||
    key === "text" ||
    key === "txt" ||
    key === "plain" ||
    key === "plaintext" ||
    supportedLanguageSet.has(key)
  );
}

function resolveLanguage(language: string): LanguageName {
  return lang(language) ?? "plaintext";
}

// Keyed by the full source: a sampled key (length + head + tail) returned another
// block's highlighted HTML for code that only differed in the middle.
function cacheKey(code: string, language: string) {
  return `${language}\n${code}`;
}

export function highlightCode(code: string, language: string): string {
  const key = cacheKey(code, language);
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  const html = highlight(code, { lang: resolveLanguage(language) });
  cache.set(key, html);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) {
      cache.delete(oldest);
    }
  }
  return html;
}
