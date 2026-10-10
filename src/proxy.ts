import { type NextRequest, NextResponse } from "next/server";
import {
  isAppPath,
  isPublicLocalizablePath,
  JA_PREFIX,
  localizedPath,
  stripJaPrefix,
} from "@/lib/locale-path";

const SESSION_COOKIE = "better-auth.session_token";
const SECURE_SESSION_COOKIE = `__Secure-${SESSION_COOKIE}`;
const LOCALE_COOKIE = "locale";
const LOCALE_HEADER = "x-locale";

function hasSessionCookie(request: NextRequest) {
  return request.cookies.has(SESSION_COOKIE) || request.cookies.has(SECURE_SESSION_COOKIE);
}

function localeFromRequest(request: NextRequest): "en" | "ja" {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale === "en" || cookieLocale === "ja") {
    return cookieLocale;
  }
  const acceptLang = request.headers.get("accept-language") ?? "";
  const isJa = acceptLang.split(",").some((entry) => entry.trim().toLowerCase().startsWith("ja"));
  return isJa ? "ja" : "en";
}

function withLocaleRequestHeaders(request: NextRequest, locale: "en" | "ja", urlLocale?: "ja") {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  if (urlLocale) {
    requestHeaders.set("x-deni-url-locale", urlLocale);
  }
  return requestHeaders;
}

function applyLocaleHeader(response: NextResponse, locale: "en" | "ja") {
  response.headers.set(LOCALE_HEADER, locale);
  return response;
}

function rewriteLocalized(request: NextRequest, pathname: string, locale: "ja") {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return applyLocaleHeader(
    NextResponse.rewrite(url, {
      request: { headers: withLocaleRequestHeaders(request, locale, "ja") },
    }),
    locale,
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === JA_PREFIX || pathname === `${JA_PREFIX}/`) {
    return rewriteLocalized(request, "/home", "ja");
  }

  if (pathname.startsWith(`${JA_PREFIX}/`)) {
    const stripped = stripJaPrefix(pathname);
    if (isAppPath(stripped)) {
      return NextResponse.redirect(new URL(`${stripped}${search}`, request.url));
    }
    return rewriteLocalized(request, stripped, "ja");
  }

  // Root path: redirect based on session cookie presence.
  // This is a lightweight heuristic — it checks cookie presence, not validity.
  // An expired or invalid cookie will redirect to /chat, where full server-side
  // auth validation occurs and handles the session properly.
  if (pathname === "/") {
    const destination = hasSessionCookie(request)
      ? "/chat"
      : request.cookies.get(LOCALE_COOKIE)?.value === "ja"
        ? JA_PREFIX
        : "/home";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // Chat is hosted outside layout RequireAuth (SPA ChatRouteHost). Gate here so
  // unauthenticated document/RSC requests never receive the chat shell.
  if (pathname === "/chat" || pathname.startsWith("/chat/")) {
    if (!hasSessionCookie(request)) {
      const destination = new URL("/auth/sign-in", request.url);
      destination.searchParams.set("redirectTo", `${pathname}${search}`);
      return NextResponse.redirect(destination);
    }
  }

  const locale = localeFromRequest(request);

  if (locale === "ja" && isPublicLocalizablePath(pathname)) {
    const prefixed = localizedPath(pathname, "ja");
    if (prefixed !== pathname) {
      return NextResponse.redirect(new URL(`${prefixed}${search}`, request.url));
    }
  }

  const response = NextResponse.next({
    request: { headers: withLocaleRequestHeaders(request, locale) },
  });
  return applyLocaleHeader(response, locale);
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
