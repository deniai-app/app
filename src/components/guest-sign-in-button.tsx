"use client";

import type { VariantProps } from "class-variance-authority";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { GuestCaptchaDialog } from "@/components/auth/guest-captcha-dialog";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import { Button, type buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { clientEnv } from "@/env.client";
import { authClient } from "@/lib/auth-client";
import { openChatAfterGuestSignIn, signInAsGuest } from "@/lib/guest-sign-in";
import { runWithLoading } from "@/lib/run-with-loading";
import { User } from "lucide-react";

type GuestSignInButtonProps = VariantProps<typeof buttonVariants> & {
  className?: string;
};

export function GuestSignInButton({
  className,
  size = "lg",
  variant = "outline",
}: GuestSignInButtonProps) {
  const t = useExtracted();
  const { data: session, isPending } = authClient.useSession();
  const platformCapabilities = usePlatformCapabilities();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChallengeOpen, setIsChallengeOpen] = useState(false);

  // The server requires a Turnstile token for /sign-in/anonymous only when both
  // keys are configured; the widget also needs the public site key here.
  const requiresCaptcha =
    platformCapabilities.auth.captcha && Boolean(clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  // Keep the challenge dialog mounted while the new guest session navigates to /chat.
  if (session && !isChallengeOpen) {
    return null;
  }

  const handleClick = () => {
    if (isPending || isSubmitting) return;
    if (requiresCaptcha) {
      setIsChallengeOpen(true);
      return;
    }

    void runWithLoading(setIsSubmitting, async () => {
      const result = await signInAsGuest((request) => authClient.signIn.anonymous(request));
      if (!result.ok) {
        toast.error(result.message || t("Failed to sign in as guest. Please try again."));
        return;
      }

      openChatAfterGuestSignIn();
    });
  };

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={handleClick}
        disabled={isPending || isSubmitting || isChallengeOpen}
      >
        {isSubmitting ? <Spinner className="size-4" /> : <User className="size-4" />}
        {t("Continue as Guest")}
      </Button>
      {requiresCaptcha ? (
        <GuestCaptchaDialog
          open={isChallengeOpen}
          onOpenChange={setIsChallengeOpen}
          onSignedIn={openChatAfterGuestSignIn}
        />
      ) : null}
    </>
  );
}
