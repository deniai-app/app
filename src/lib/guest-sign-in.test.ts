import { expect, test, vi } from "vitest";
import { CAPTCHA_RESPONSE_HEADER, signInAsGuest } from "./guest-sign-in";

const session = { user: { id: "guest" }, token: "session-token" };

test("guest sign-in without Turnstile sends the request unchanged", async () => {
  const signIn = vi.fn(async () => ({ data: session, error: null }));

  await expect(signInAsGuest(signIn)).resolves.toEqual({ ok: true });
  expect(signIn).toHaveBeenCalledWith(undefined);
});

test("guest sign-in forwards the Turnstile token as the captcha header", async () => {
  const signIn = vi.fn(async () => ({ data: session, error: null }));

  await expect(signInAsGuest(signIn, "turnstile-token")).resolves.toEqual({ ok: true });
  expect(signIn).toHaveBeenCalledWith({
    fetchOptions: { headers: { [CAPTCHA_RESPONSE_HEADER]: "turnstile-token" } },
  });
  expect(CAPTCHA_RESPONSE_HEADER).toBe("x-captcha-response");
});

test.each(["MISSING_RESPONSE", "VERIFICATION_FAILED"])(
  "captcha rejection %s asks the visitor for a new challenge",
  async (code) => {
    const signIn = vi.fn(async () => ({
      data: null,
      error: { code, message: "Captcha verification failed" },
    }));

    await expect(signInAsGuest(signIn, "used-token")).resolves.toEqual({
      ok: false,
      captchaRejected: true,
      code,
      message: "Captcha verification failed",
    });
  },
);

test("other sign-in failures keep the server message", async () => {
  const signIn = vi.fn(async () => ({
    data: null,
    error: { code: "TOO_MANY_REQUESTS", message: "Too many requests" },
  }));

  await expect(signInAsGuest(signIn, "token")).resolves.toEqual({
    ok: false,
    captchaRejected: false,
    code: "TOO_MANY_REQUESTS",
    message: "Too many requests",
  });
});

test("a missing session or thrown error is reported without a message", async () => {
  await expect(signInAsGuest(async () => ({ data: null, error: null }))).resolves.toEqual({
    ok: false,
    captchaRejected: false,
    code: null,
    message: null,
  });
  await expect(
    signInAsGuest(async () => {
      throw new Error("");
    }),
  ).resolves.toEqual({ ok: false, captchaRejected: false, code: null, message: null });
  await expect(
    signInAsGuest(async () => {
      throw new Error("Network down");
    }),
  ).resolves.toEqual({
    ok: false,
    captchaRejected: false,
    code: null,
    message: "Network down",
  });
});
