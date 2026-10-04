import { render } from "@react-email/render";
import { createElement } from "react";
import { expect, test } from "vitest";
import {
  ChangeEmailConfirmationEmail,
  changeEmailConfirmationEmailSubject,
} from "./change-email-confirmation-email";

const props = {
  name: "Rai",
  currentEmail: "old@outlook.com",
  newEmail: "new@icloud.com",
  confirmUrl:
    "https://deniai.app/api/auth/verify-email?token=header.payload.signature&callbackURL=%2Faccount%2Fsettings",
  securityUrl: "https://deniai.app/account/security",
};

test("names both addresses and links to the confirmation URL", async () => {
  const html = await render(createElement(ChangeEmailConfirmationEmail, props));

  expect(html).toContain(props.currentEmail);
  expect(html).toContain(props.newEmail);
  // Button and fallback link both point at the Better Auth confirmation URL.
  const escapedUrl = props.confirmUrl.replaceAll("&", "&amp;");
  expect(html.split(`href="${escapedUrl}"`).length - 1).toBe(2);
  expect(html).toContain(`href="${props.securityUrl}"`);
  expect(changeEmailConfirmationEmailSubject).toBe("Confirm your email change - Deni AI");
});

test("plain-text version tells unexpected recipients not to confirm", async () => {
  const text = await render(createElement(ChangeEmailConfirmationEmail, props), {
    plainText: true,
  });

  expect(text).toContain(props.newEmail);
  expect(text).toContain(props.confirmUrl);
  expect(text).toContain("If you didn't request this change, don't click the link.");
  expect(text).toContain("changing your password and signing out of other sessions");
});

test("escapes user-controlled values", async () => {
  const html = await render(
    createElement(ChangeEmailConfirmationEmail, {
      ...props,
      name: '<img src=x onerror="alert(1)">',
      securityUrl: undefined,
    }),
  );

  expect(html).not.toContain("<img src=x");
  expect(html).toContain("&lt;img src=x");
  expect(html).not.toContain("security settings");
});
