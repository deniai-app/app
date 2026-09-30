import { env } from "@/env";

/** Compare against the public origin, not request.url (which may contain an internal proxy host). */
export function isAllowedAdOrigin(request: Request) {
  return request.headers.get("origin") === new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin;
}

/** Click navigation sends Referer rather than Origin. Keep the same public-origin boundary. */
export function isAllowedAdClickOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") !== "same-origin") return false;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin;
  } catch {
    return false;
  }
}
