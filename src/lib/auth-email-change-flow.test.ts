import { APIError } from "better-auth/api";
import { afterEach, expect, test, vi } from "vitest";
import { NewEmailVerificationEmail } from "@/emails/new-email-verification-email";
import { VerificationEmail } from "@/emails/verification-email";
import { readEmailChangeToken } from "./email-change-token";
import { securityActionForAuthResponse } from "./security-activity";

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn(), recordSecurityActivity: vi.fn() }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => true, sendEmail: mocks.sendEmail }));
vi.mock("@/lib/security-activity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./security-activity")>()),
  recordSecurityActivity: mocks.recordSecurityActivity,
}));

// The first cold import of the full auth module graph is slow.
const AUTH_IMPORT_TIMEOUT = { timeout: 30_000 };

/** Unsigned stand-in: these callbacks only run after Better Auth verified the JWT. */
function token(payload: Record<string, unknown>) {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part(payload)}.signature`;
}

const changeToken = token({
  email: "old@outlook.com",
  updateTo: "new@icloud.com",
  requestType: "change-email-verification",
});
const user = {
  id: "user-1",
  name: "Rai",
  email: "new@icloud.com",
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

afterEach(() => {
  mocks.sendEmail.mockReset();
  mocks.recordSecurityActivity.mockReset();
});

test("reads only the email-change fields of a verification token", () => {
  expect(readEmailChangeToken(changeToken)).toEqual({
    newEmail: "new@icloud.com",
    requestType: "change-email-verification",
  });
  expect(readEmailChangeToken(token({ email: "new@icloud.com" }))).toBeNull();
  expect(readEmailChangeToken("not-a-jwt")).toBeNull();
  expect(readEmailChangeToken(null)).toBeNull();
});

test("failed auth requests are not logged as security events", () => {
  const ok = { status: true };
  expect(securityActionForAuthResponse({ path: "/change-password", returned: ok })).toBe(
    "password_changed",
  );
  expect(
    securityActionForAuthResponse({
      path: "/change-password",
      returned: new APIError("BAD_REQUEST"),
    }),
  ).toBeNull();
  // Requesting a change is not the change itself.
  expect(securityActionForAuthResponse({ path: "/change-email", returned: ok })).toBe(
    "email_change_requested",
  );
});

test("2FA is logged as enabled only when the first code switches it on", () => {
  const ok = { status: true };
  // Starting setup only issues the TOTP secret.
  expect(securityActionForAuthResponse({ path: "/two-factor/enable", returned: ok })).toBeNull();
  expect(
    securityActionForAuthResponse({
      path: "/two-factor/verify-totp",
      returned: ok,
      requestUser: { twoFactorEnabled: false },
      issuedUser: { twoFactorEnabled: true },
    }),
  ).toBe("two_factor_enabled");
  // A 2FA sign-in has no prior session and must not read as enabling 2FA.
  expect(
    securityActionForAuthResponse({
      path: "/two-factor/verify-totp",
      returned: ok,
      issuedUser: { twoFactorEnabled: true },
    }),
  ).toBeNull();
  expect(
    securityActionForAuthResponse({
      path: "/two-factor/verify-totp",
      returned: new APIError("UNAUTHORIZED"),
      requestUser: { twoFactorEnabled: false },
    }),
  ).toBeNull();
});

test(
  "the new address gets email-change wording, sign-ups keep the welcome email",
  AUTH_IMPORT_TIMEOUT,
  async () => {
    const { auth } = await import("./auth");
    const send = auth.options.emailVerification?.sendVerificationEmail;
    const url = "http://localhost:3000/api/auth/verify-email?token=t";

    await send?.({ user, url, token: changeToken });
    await send?.({ user, url, token: token({ email: "new@icloud.com" }) });

    const [[change], [signUp]] = mocks.sendEmail.mock.calls as [
      [{ to: string; react: { type: { name: string }; props: Record<string, unknown> } }],
      [{ to: string; react: { type: { name: string } } }],
    ];
    expect(change.to).toBe("new@icloud.com");
    expect(change.react.type.name).toBe(NewEmailVerificationEmail.name);
    expect(change.react.props).toMatchObject({ newEmail: "new@icloud.com", verificationUrl: url });
    expect(signUp.react.type.name).toBe(VerificationEmail.name);
  },
);

test(
  "the email change is logged when the new address is verified",
  AUTH_IMPORT_TIMEOUT,
  async () => {
    const { auth } = await import("./auth");
    const after = auth.options.emailVerification?.afterEmailVerification;
    const verify = (tokenValue: string) =>
      after?.(
        user,
        new Request(`http://localhost:3000/api/auth/verify-email?token=${tokenValue}`, {
          headers: { "x-forwarded-for": "203.0.113.7", "user-agent": "test-agent" },
        }),
      );

    await verify(changeToken);
    await verify(
      token({
        email: "old@outlook.com",
        updateTo: "new@icloud.com",
        requestType: "change-email-confirmation",
      }),
    );
    await verify(token({ email: "new@icloud.com" }));

    expect(mocks.recordSecurityActivity).toHaveBeenCalledOnce();
    expect(mocks.recordSecurityActivity).toHaveBeenCalledWith({
      userId: "user-1",
      action: "email_changed",
      ipAddress: "203.0.113.7",
      userAgent: "test-agent",
      metadata: { path: "/verify-email" },
    });
  },
);
