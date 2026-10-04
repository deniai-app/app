"use client";

import { useAuth, useSendVerificationEmail } from "@better-auth-ui/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toSafeRedirectPath } from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";
import { OpenEmailButton } from "./open-email-button";

export type VerifyEmailProps = {
  className?: string;
};

/** Seconds the resend button stays disabled to prevent spamming the endpoint. */
const RESEND_COOLDOWN_SECONDS = 60;

/** Written by better-auth-ui when sign-up or sign-in redirects here. */
const VERIFY_EMAIL_STORAGE_KEY = "better-auth-ui.verify-email";

/** The key is written before this route loads and never changes, so never notify. */
function subscribeNever() {
  return () => {};
}

function getStoredEmail() {
  try {
    return sessionStorage.getItem(VERIFY_EMAIL_STORAGE_KEY) ?? "";
  } catch {
    // Blocked storage (private mode, third-party cookie policies).
    return "";
  }
}

function getServerStoredEmail() {
  return "";
}

/**
 * Reads the pending verification email from `sessionStorage` without touching a
 * browser global during render: the server snapshot is empty and the client
 * snapshot is applied on hydration.
 *
 * @returns The stored email, or an empty string when none is available.
 */
function useStoredVerifyEmail() {
  return useSyncExternalStore(subscribeNever, getStoredEmail, getServerStoredEmail);
}

/**
 * Render a card prompting the user to verify their email, with a resend button
 * that is rate-limited by a cooldown timer.
 *
 * The target email is read from `sessionStorage` (set when sign-up or sign-in
 * redirects here); the OpenEmail/Resend controls are only shown when an email
 * is stored. The resend button is disabled while a cooldown is active and shows
 * the remaining seconds.
 *
 * @param className - Additional CSS classes applied to the card
 * @returns The verify-email card React element
 */
export function VerifyEmail({ className }: VerifyEmailProps) {
  const { authClient, basePaths, baseURL, localization, redirectTo, viewPaths, Link } = useAuth();

  const email = useStoredVerifyEmail();
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0 || !email) return;

    const interval = setInterval(() => {
      setCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldown, email]);

  const { mutate: sendVerificationEmail, isPending } = useSendVerificationEmail(authClient, {
    onSuccess: () => {
      toast.success(localization.auth.verificationEmailSent);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    },
  });

  const isCoolingDown = cooldown > 0;

  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{localization.auth.verifyEmail}</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-4">
          <FieldDescription>{localization.auth.checkYourEmail}</FieldDescription>

          {email && (
            <div className="flex flex-col gap-3">
              <OpenEmailButton email={email} />

              <Button
                type="button"
                variant="outline"
                disabled={!email || isCoolingDown || isPending}
                onClick={() =>
                  sendVerificationEmail({
                    email,
                    callbackURL: `${baseURL}${toSafeRedirectPath(redirectTo)}`,
                  })
                }
              >
                {isPending && <Spinner />}

                {isCoolingDown
                  ? localization.auth.resendIn.replace("{{seconds}}", String(cooldown))
                  : localization.auth.resend}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 items-center w-full mt-4">
          <FieldDescription className="text-center">
            {localization.auth.alreadyVerifiedYourEmail}{" "}
            <Link
              href={`${basePaths.auth}/${viewPaths.auth.signIn}`}
              className="underline underline-offset-4"
            >
              {localization.auth.signIn}
            </Link>
          </FieldDescription>
        </div>
      </CardContent>
    </Card>
  );
}
