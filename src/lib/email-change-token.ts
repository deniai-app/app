export type EmailChangeToken = {
  newEmail: string;
  requestType: string | null;
};

/**
 * Reads the email-change fields of a Better Auth email verification JWT.
 *
 * Better Auth signs and verifies these tokens itself. The payload is only read
 * here to pick the right email wording or to log a change Better Auth has
 * already verified, never to authorize anything.
 */
export function readEmailChangeToken(token: string | null | undefined): EmailChangeToken | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null) return null;

    const { updateTo, requestType } = decoded as { updateTo?: unknown; requestType?: unknown };
    if (typeof updateTo !== "string") return null;

    return {
      newEmail: updateTo,
      requestType: typeof requestType === "string" ? requestType : null,
    };
  } catch {
    return null;
  }
}
