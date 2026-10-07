import { env } from "@/env";

/** Same-site subdomains and opaque origins must not act with the user's cookies. */
export function guardMutationRequest(request: Request, contentType?: string): Response | null {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (
    site === "cross-site" ||
    site === "same-site" ||
    (origin !== null && origin !== new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin)
  ) {
    return Response.json({ error: "Forbidden origin" }, { status: 403 });
  }
  if (
    contentType &&
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== contentType
  ) {
    return Response.json({ error: "Unsupported content type" }, { status: 415 });
  }
  return null;
}
