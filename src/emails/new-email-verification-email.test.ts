import { render } from "@react-email/render";
import { createElement } from "react";
import { expect, test } from "vitest";
import {
  NewEmailVerificationEmail,
  newEmailVerificationEmailSubject,
} from "./new-email-verification-email";

const props = {
  name: "Rai",
  newEmail: "new@icloud.com",
  verificationUrl: "https://deniai.app/api/auth/verify-email?token=a.b.c&callbackURL=%2Faccount",
};

test("explains the email change instead of welcoming a new sign-up", async () => {
  const text = await render(createElement(NewEmailVerificationEmail, props), { plainText: true });

  expect(text).toContain(props.newEmail);
  expect(text).toContain(props.verificationUrl);
  expect(text).toContain("change the email address");
  expect(text).not.toContain("Thank you for signing up");
  expect(newEmailVerificationEmailSubject).toBe("Verify your new email address - Deni AI");
});

test("escapes user-controlled values", async () => {
  const html = await render(
    createElement(NewEmailVerificationEmail, { ...props, name: '<img src=x onerror="alert(1)">' }),
  );

  expect(html).not.toContain("<img src=x");
});
