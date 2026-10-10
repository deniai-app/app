import { PUBLIC_SITE_ORIGIN, publicPages } from "@/lib/public-pages";

export const JA_PREFIX = "/ja";

const APP_PATH_PREFIXES = [
  "/chat",
  "/settings",
  "/api",
  "/auth",
  "/account",
  "/getting-started",
] as const;

export function isAppPath(pathname: string): boolean {
  return APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const PUBLIC_PATHS = new Set(publicPages.map((page) => page.path).filter((path) => path !== "/"));

export function isPublicLocalizablePath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }
  return pathname.startsWith("/blog/") || pathname.startsWith("/guides/");
}

export function stripJaPrefix(pathname: string): string {
  if (pathname === "/ja" || pathname === "/ja/") {
    return "/home";
  }
  if (pathname.startsWith("/ja/")) {
    return pathname.slice(3);
  }
  return pathname;
}

/** Map a site path onto the locale-prefixed public URL. App routes stay unprefixed. */
export function localizedPath(path: string, locale: string): string {
  if (
    path.startsWith("http") ||
    path.startsWith("mailto:") ||
    path.startsWith("#") ||
    path.startsWith("tel:")
  ) {
    return path;
  }

  const stripped = stripJaPrefix(path);
  if (isAppPath(stripped) || locale !== "ja") {
    return stripped;
  }
  if (stripped === "/home" || stripped === "/") {
    return JA_PREFIX;
  }
  return `${JA_PREFIX}${stripped}`;
}

export function absoluteUrl(path: string, locale: string): string {
  const localized = localizedPath(path, locale);
  if (localized === "/") {
    return PUBLIC_SITE_ORIGIN;
  }
  return `${PUBLIC_SITE_ORIGIN}${localized}`;
}

export function hreflangLanguages(path: string): Record<string, string> {
  const stripped = stripJaPrefix(path);
  const enPath = stripped === "/" ? "/home" : stripped;
  return {
    en: absoluteUrl(enPath, "en"),
    ja: absoluteUrl(enPath, "ja"),
    "x-default": absoluteUrl(enPath, "en"),
  };
}
