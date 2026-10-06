"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { useExtracted } from "next-intl";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

type OAuthConsentProps = {
  clientName?: string;
  clientUri?: string;
  requestedScopes: string[];
};

export function OAuthConsent({ clientName, clientUri, requestedScopes }: OAuthConsentProps) {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const displayClientName = clientName || t("the application");

  const getScopeDescription = (scope: string) => {
    switch (scope) {
      case "openid":
        return t("Identify your Deni AI account");
      case "profile":
        return t("View your name and profile picture");
      case "email":
        return t("View your email address");
      case "offline_access":
        return t("Keep access after you leave");
      default:
        return t("Request the {scope} permission", { scope });
    }
  };

  const handleDecision = async (accept: boolean) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await authClient.oauth2.consent({ accept });
      if (error || !data?.url) {
        toast.error(localizeError(error, t("Unable to complete this authorization request.")));
        return;
      }

      window.location.assign(data.url);
    } catch (error) {
      toast.error(localizeError(error, t("Unable to complete this authorization request.")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-secondary">
          <ShieldCheck className="size-6 text-foreground" aria-hidden="true" />
        </div>
        <CardTitle>{t("Sign in with Deni AI")}</CardTitle>
        <CardDescription>
          {t("{clientName} is requesting access to your Deni AI account.", {
            clientName: displayClientName,
          })}
        </CardDescription>
        {clientUri ? (
          <a
            className="mx-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            href={clientUri}
            target="_blank"
            rel="noreferrer"
          >
            {clientUri}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("This app will be able to:")}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {requestedScopes.map((scope) => (
              <li key={scope} className="flex gap-2">
                <span
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-current"
                  aria-hidden="true"
                />
                <span>{getScopeDescription(scope)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button
            className="flex-1"
            onClick={() => void handleDecision(true)}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : <ShieldCheck />}
            {t("Allow")}
          </Button>
          <Button
            className="flex-1"
            variant="outline"
            onClick={() => void handleDecision(false)}
            disabled={isSubmitting}
          >
            {t("Deny")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
