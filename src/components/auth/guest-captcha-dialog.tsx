"use client";

import { useExtracted } from "next-intl";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { LazyTurnstileCaptcha } from "@/lib/auth/captcha-plugin";
import { authClient } from "@/lib/auth-client";
import { signInAsGuest } from "@/lib/guest-sign-in";

export type GuestCaptchaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignedIn: () => void;
};

type ChallengePhase = "awaiting-token" | "signing-in" | "failed";

// Retrying remounts the widget, so the widget's own reset handle is not needed.
function ignoreWidgetReset() {}

/**
 * Cloudflare Turnstile challenge for guest sign-in, used only when Turnstile is
 * configured. The guest session starts as soon as the widget issues a token;
 * managed challenges usually pass without any interaction.
 */
export function GuestCaptchaDialog({ open, onOpenChange, onSignedIn }: GuestCaptchaDialogProps) {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const [phase, setPhase] = useState<ChallengePhase>("awaiting-token");
  const [error, setError] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);

  const challengeFailedMessage = t("The security check could not be completed. Please try again.");
  const isSigningIn = phase === "signing-in";

  const handleOpenChange = (nextOpen: boolean) => {
    // Keep the dialog up until the in-flight sign-in settles.
    if (!nextOpen && isSigningIn) return;
    if (!nextOpen) {
      // The widget unmounts with the popup, so the next opening starts over.
      setPhase("awaiting-token");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleToken = async (token: string) => {
    // Tokens are single-use. After a failed attempt, wait for an explicit retry
    // instead of submitting whichever token Turnstile refreshes next.
    if (phase !== "awaiting-token") return;

    setPhase("signing-in");
    setError(null);
    const result = await signInAsGuest((request) => authClient.signIn.anonymous(request), token);
    if (result.ok) {
      onSignedIn();
      return;
    }

    setPhase("failed");
    setError(
      result.captchaRejected
        ? challengeFailedMessage
        : result.message
          ? localizeError({ code: result.code, message: result.message })
          : t("Failed to sign in as guest. Please try again."),
    );
  };

  const handleTokenCleared = () => {
    // The challenge errored before a token was used. Turnstile keeps retrying
    // on its own; the retry button below starts a fresh widget instead.
    if (phase === "awaiting-token") setError(challengeFailedMessage);
  };

  const handleRetry = () => {
    setPhase("awaiting-token");
    setError(null);
    setWidgetKey((key) => key + 1);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={!isSigningIn}>
        <DialogHeader>
          <DialogTitle>{t("Continue as Guest")}</DialogTitle>
          <DialogDescription>
            {t("Complete a quick security check to start your guest session.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[65px] justify-center">
          <LazyTurnstileCaptcha
            key={widgetKey}
            setToken={(token) => void handleToken(token)}
            clearToken={handleTokenCleared}
            setReset={ignoreWidgetReset}
          />
        </div>

        {isSigningIn ? (
          <p className="flex items-center justify-center gap-2 text-muted-foreground">
            <Spinner />
            {t("Starting your guest session…")}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-center text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSigningIn}
            onClick={() => handleOpenChange(false)}
          >
            {t("Cancel")}
          </Button>
          {error ? (
            <Button type="button" onClick={handleRetry}>
              {t("Try again")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
