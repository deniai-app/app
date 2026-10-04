/**
 * Header Better Auth's captcha plugin reads the Cloudflare Turnstile token from.
 * The better-auth-ui captcha plugin sends the email auth forms' tokens the same way.
 */
export const CAPTCHA_RESPONSE_HEADER = "x-captcha-response";

/** Captcha plugin error codes that mean the visitor has to pass a new challenge. */
const CAPTCHA_ERROR_CODES = new Set(["MISSING_RESPONSE", "VERIFICATION_FAILED"]);

export type GuestSignInRequest = {
  fetchOptions?: { headers: Record<string, string> };
};

type GuestSignInResponse = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

export type GuestSignInResult =
  | { ok: true }
  | { ok: false; captchaRejected: boolean; message: string | null };

/**
 * Starts an anonymous (guest) session through `signIn` (normally
 * `authClient.signIn.anonymous`). When Turnstile is configured the server
 * rejects the request unless `captchaToken` is supplied; without a token the
 * request is sent exactly as before.
 */
export async function signInAsGuest(
  signIn: (request?: GuestSignInRequest) => Promise<GuestSignInResponse>,
  captchaToken?: string,
): Promise<GuestSignInResult> {
  try {
    const { data, error } = await signIn(
      captchaToken
        ? { fetchOptions: { headers: { [CAPTCHA_RESPONSE_HEADER]: captchaToken } } }
        : undefined,
    );
    if (!error && data) return { ok: true };

    return {
      ok: false,
      captchaRejected: CAPTCHA_ERROR_CODES.has(error?.code ?? ""),
      message: error?.message || null,
    };
  } catch (error) {
    return {
      ok: false,
      captchaRejected: false,
      message: error instanceof Error && error.message ? error.message : null,
    };
  }
}

/**
 * A /chat prefetch made before sign-in can contain the unauthenticated
 * redirect. Use a document navigation so that cached RSC redirects are not
 * reused after the anonymous session cookie has been set.
 */
export function openChatAfterGuestSignIn() {
  window.location.assign("/chat");
}
