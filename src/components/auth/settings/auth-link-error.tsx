"use client";

import { AlertCircleIcon, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Better Auth sends the browser back to account settings with `?error=CODE`
 * when an email link (email change confirmation/verification) or an account
 * link cannot be completed. Surface that instead of silently showing the page.
 */
export function AuthLinkError() {
  const t = useExtracted();
  const router = useRouter();
  const pathname = usePathname();
  const code = useSearchParams().get("error");

  if (!code) {
    return null;
  }

  const descriptions: Record<string, string> = {
    TOKEN_EXPIRED: t(
      "This link has expired. Request a new email, then open its link within an hour.",
    ),
    INVALID_TOKEN: t(
      "This link is invalid or has already been used. Request a new email and try again.",
    ),
    INVALID_USER: t(
      "This link belongs to a different account. Sign out, then open the link again.",
    ),
    USER_NOT_FOUND: t("The account this link was sent for no longer exists."),
  };

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircleIcon />
      <AlertTitle>{t("We couldn't complete that request")}</AlertTitle>
      <AlertDescription>
        {descriptions[code] ??
          t("Something went wrong. Please try again. (Error: {code})", { code })}
      </AlertDescription>
      <AlertAction>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => router.replace(pathname, { scroll: false })}
        >
          <X />
          <span className="sr-only">{t("Dismiss")}</span>
        </Button>
      </AlertAction>
    </Alert>
  );
}
