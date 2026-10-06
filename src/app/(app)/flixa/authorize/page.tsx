"use client";

import { CheckCircle2, Code2, KeyRound, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { authClient } from "@/lib/auth-client";

type Status = "idle" | "selectingKey" | "success" | "error";

const flixaDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string) {
  return flixaDateFormatter.format(new Date(value));
}

type ApiKeyOption = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type ApproveResponse = {
  code?: string;
  error?: string;
  apiKeys?: ApiKeyOption[];
};

type ApproveResult =
  | { type: "success" }
  | { type: "selectingKey"; apiKeys: ApiKeyOption[] }
  | { type: "error"; message: string };

// Extracted to a plain (non-component, non-hook) helper so the React Compiler
// doesn't need to lower the try/catch/finally/throw control flow here.
async function approveDeviceAuth(code: string, revokeKeyId?: string): Promise<ApproveResult> {
  try {
    const res = await fetch("/api/device-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        userCode: code,
        ...(revokeKeyId ? { revokeKeyId } : {}),
      }),
    });
    if (!res.ok) {
      const data = (await res.json()) as ApproveResponse;
      if (
        res.status === 409 &&
        data.code === "API_KEY_LIMIT_REACHED" &&
        Array.isArray(data.apiKeys)
      ) {
        return { type: "selectingKey", apiKeys: data.apiKeys };
      }
      throw new Error(data.error || "Failed to approve");
    }
    return { type: "success" };
  } catch (err) {
    return { type: "error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

function FlixaAuthorizeContent() {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const { data: session } = authClient.useSession();
  const isAnonymous = Boolean(session?.user?.isAnonymous);
  const [status, setStatus] = useState<Status>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [apiKeys, setApiKeys] = useState<ApiKeyOption[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState("");

  const handleApprove = async (revokeKeyId?: string) => {
    if (!code) return;
    setIsSubmitting(true);
    setErrorMessage("");
    const result = await approveDeviceAuth(code, revokeKeyId);
    if (result.type === "selectingKey") {
      setApiKeys(result.apiKeys);
      setSelectedKeyId(result.apiKeys[0]?.id ?? "");
      setStatus("selectingKey");
    } else if (result.type === "error") {
      setErrorMessage(localizeError(result.message));
      setStatus("error");
    } else {
      setApiKeys([]);
      setSelectedKeyId("");
      setStatus("success");
    }
    setIsSubmitting(false);
  };

  if (isAnonymous) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="size-6 text-destructive" />
            </div>
            <CardTitle>{t("Sign in required")}</CardTitle>
            <CardDescription>
              {t(
                "Guest accounts cannot authorize the Flixa extension. Please sign in with a permanent account to continue.",
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="size-6 text-destructive" />
            </div>
            <CardTitle>{t("Invalid Request")}</CardTitle>
            <CardDescription>
              {t("No authorization code was provided. Please try again from the Flixa extension.")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="size-6 text-green-500" />
            </div>
            <CardTitle>{t("Device Authorized")}</CardTitle>
            <CardDescription>
              {t(
                "You can close this page and return to the Flixa extension. The connection will be established automatically.",
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="size-6 text-destructive" />
            </div>
            <CardTitle>{t("Authorization Failed")}</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => setStatus("idle")}>
              {t("Try Again")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "selectingKey") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-amber-500/10">
              <KeyRound className="size-6 text-amber-600" />
            </div>
            <CardTitle>{t("API key limit reached")}</CardTitle>
            <CardDescription>
              {t(
                "You already have 5 API keys. Revoke one to continue authorizing the Flixa extension.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("Select an API key to revoke.")}
              </p>
              <RadioGroup
                value={selectedKeyId}
                onValueChange={(value) => setSelectedKeyId(value as string)}
                className="space-y-2"
              >
                {apiKeys.map((apiKey) => (
                  <label
                    key={apiKey.id}
                    htmlFor={`api-key-${apiKey.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/40"
                  >
                    <RadioGroupItem
                      value={apiKey.id}
                      id={`api-key-${apiKey.id}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-sm">{apiKey.name}</span>
                        <code className="font-mono text-xs text-muted-foreground">
                          {apiKey.keyPrefix}••••••••
                        </code>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{t("Created {date}", { date: formatDate(apiKey.createdAt) })}</span>
                        <span>
                          {apiKey.lastUsedAt
                            ? t("Last used {date}", { date: formatDate(apiKey.lastUsedAt) })
                            : t("Never used")}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("This immediately invalidates the selected API key.")}
            </p>

            <Button
              onClick={() => handleApprove(selectedKeyId)}
              disabled={!selectedKeyId || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("Approving...")}
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  {t("Revoke selected key and approve")}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-secondary">
            <ShieldCheck className="size-6 text-foreground" />
          </div>
          <CardTitle>{t("Authorize Flixa Extension")}</CardTitle>
          <CardDescription>
            {t(
              "The Flixa extension is requesting access to your Deni AI account. Verify the code below matches what is shown in your editor.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {t("Confirmation Code")}
            </p>
            <div className="flex items-center gap-1.5">
              <Code2 className="size-5 text-muted-foreground" />
              <span className="text-3xl font-mono font-bold tracking-[0.2em]">{code}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={() => handleApprove()} disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("Approving...")}
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  {t("Approve")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function FlixaAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <FlixaAuthorizeContent />
    </Suspense>
  );
}
