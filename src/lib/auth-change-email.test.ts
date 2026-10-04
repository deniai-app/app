import { isValidElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  ChangeEmailConfirmationEmail,
  changeEmailConfirmationEmailSubject,
} from "@/emails/change-email-confirmation-email";

const email = vi.hoisted(() => ({ configured: true, sendEmail: vi.fn() }));
vi.mock("@/lib/email", () => ({
  isEmailConfigured: () => email.configured,
  sendEmail: email.sendEmail,
}));

// Each case re-imports the full auth module graph; the first cold import is slow.
const AUTH_IMPORT_TIMEOUT = { timeout: 30_000 };

async function loadAuth(configured: boolean) {
  vi.resetModules();
  email.configured = configured;
  const { auth } = await import("./auth");
  return auth;
}

afterEach(() => {
  email.sendEmail.mockReset();
});

test(
  "verified accounts confirm an email change from their current address first",
  AUTH_IMPORT_TIMEOUT,
  async () => {
    const auth = await loadAuth(true);
    const changeEmail = auth.options.user.changeEmail;

    expect(changeEmail.enabled).toBe(true);
    // Better Auth only takes the confirmation path when verification emails
    // can also be sent (for the second step to the new address).
    expect(auth.options.emailVerification?.sendVerificationEmail).toBeTypeOf("function");
    expect(changeEmail.sendChangeEmailConfirmation).toBeTypeOf("function");

    const url =
      "http://localhost:3000/api/auth/verify-email?token=t&callbackURL=%2Faccount%2Fsettings";
    await changeEmail.sendChangeEmailConfirmation?.({
      user: {
        id: "user-1",
        name: "Rai",
        email: "old@outlook.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      newEmail: "new@icloud.com",
      url,
      token: "t",
    });

    expect(email.sendEmail).toHaveBeenCalledOnce();
    const [message] = email.sendEmail.mock.calls[0] as [
      { to: string; subject: string; react: unknown },
    ];
    expect(message.to).toBe("old@outlook.com");
    expect(message.subject).toBe(changeEmailConfirmationEmailSubject);
    expect(isValidElement(message.react)).toBe(true);
    const element = message.react as { type: { name: string }; props: Record<string, unknown> };
    // `vi.resetModules()` gives auth its own copy of the template module.
    expect(element.type.name).toBe(ChangeEmailConfirmationEmail.name);
    expect(element.props).toMatchObject({
      name: "Rai",
      currentEmail: "old@outlook.com",
      newEmail: "new@icloud.com",
      confirmUrl: url,
      securityUrl: "http://localhost:3000/account/security",
    });
  },
);

test(
  "email change is disabled when email delivery is not configured",
  AUTH_IMPORT_TIMEOUT,
  async () => {
    const auth = await loadAuth(false);

    expect(auth.options.user.changeEmail.enabled).toBe(false);
    expect(auth.options.user.changeEmail.sendChangeEmailConfirmation).toBeUndefined();
  },
);

test(
  "the email-domain policy still guards the requested and the final address",
  AUTH_IMPORT_TIMEOUT,
  async () => {
    const auth = await loadAuth(true);

    const requestChange = (newEmail: string) =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/change-email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({ newEmail }),
        }),
      );

    // Request step: the before hook rejects a disallowed new address before
    // the session check or any email is sent.
    const denied = await requestChange("someone@example.com");
    expect(denied.status).toBe(400);
    await expect(denied.json()).resolves.toMatchObject({ code: "EMAIL_DOMAIN_NOT_ALLOWED" });
    // An allowed address passes the hook and stops at the session requirement.
    const allowed = await requestChange("rai@icloud.com");
    expect(allowed.status).toBe(401);
    expect(email.sendEmail).not.toHaveBeenCalled();

    // Final step: Better Auth updates the email through updateUserByEmail,
    // which runs the user update hook.
    const beforeUpdate = auth.options.databaseHooks.user.update.before;
    await expect(beforeUpdate({ email: "someone@example.com" })).rejects.toThrow();
    await expect(beforeUpdate({ email: "rai@icloud.com" })).resolves.toBeUndefined();
  },
);
