"use client";

import { useEffect, useState } from "react";
import { useExtracted } from "next-intl";
import { useLocalizeError } from "@/hooks/use-localize-error";
import {
  ArrowUpRight,
  Check,
  AlertCircleIcon,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PLAYGROUND_STORAGE_KEY = "deni-ai-oauth-playground";
const DEFAULT_SCOPE = "openid profile email";

type StoredFlow = {
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
};

type FlowResult = {
  name?: string;
  email?: string;
  picture?: string;
  accessTokenReceived: boolean;
  refreshTokenReceived: boolean;
};

type FlowStatus = "idle" | "starting" | "processing" | "success" | "error";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function createPkce() {
  const verifier = randomString(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

function defaultRedirectUri(): string {
  return `${window.location.origin}/oauth/example`;
}

function parseStoredFlow(): StoredFlow | null {
  try {
    const raw = window.sessionStorage.getItem(PLAYGROUND_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredFlow>;
    if (
      typeof value.clientId !== "string" ||
      typeof value.redirectUri !== "string" ||
      typeof value.state !== "string" ||
      typeof value.verifier !== "string"
    ) {
      return null;
    }
    return value as StoredFlow;
  } catch {
    return null;
  }
}

function isValidRedirectUri(value: string): boolean {
  try {
    const uri = new URL(value);
    return uri.protocol === "https:" || uri.protocol === "http:";
  } catch {
    return false;
  }
}

export function OAuthExampleClient() {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const [clientId, setClientId] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState<FlowResult | null>(null);

  useEffect(() => {
    const storedFlow = parseStoredFlow();
    const params = new URLSearchParams(window.location.search);
    setClientId(params.get("client_id") ?? storedFlow?.clientId ?? "");
    setRedirectUri(storedFlow?.redirectUri ?? defaultRedirectUri());

    const code = params.get("code");
    const providerError = params.get("error");
    if (!code && !providerError) return;

    window.history.replaceState({}, "", window.location.pathname);
    if (providerError) {
      window.sessionStorage.removeItem(PLAYGROUND_STORAGE_KEY);
      setStatus("error");
      setStatusMessage(
        `${providerError}${params.get("error_description") ? `: ${params.get("error_description")}` : ""}`,
      );
      return;
    }

    if (!storedFlow || params.get("state") !== storedFlow.state) {
      window.sessionStorage.removeItem(PLAYGROUND_STORAGE_KEY);
      setStatus("error");
      setStatusMessage(t("The OAuth state did not match this browser session."));
      return;
    }

    if (!code) {
      window.sessionStorage.removeItem(PLAYGROUND_STORAGE_KEY);
      setStatus("error");
      setStatusMessage(t("The authorization response did not include a code."));
      return;
    }

    const completeFlow = async () => {
      setStatus("processing");
      setStatusMessage(t("Exchanging the authorization code securely…"));

      try {
        const tokenBody = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: storedFlow.clientId,
          redirect_uri: storedFlow.redirectUri,
          code_verifier: storedFlow.verifier,
        });
        const tokenResponse = await fetch("/api/auth/oauth2/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: tokenBody,
          credentials: "omit",
        });
        const token = (await tokenResponse.json()) as Record<string, unknown>;
        const accessToken = typeof token.access_token === "string" ? token.access_token : undefined;
        if (!tokenResponse.ok || !accessToken) {
          throw new Error(
            typeof token.error_description === "string"
              ? token.error_description
              : t("The authorization code could not be exchanged."),
          );
        }

        const userInfoResponse = await fetch("/api/auth/oauth2/userinfo", {
          headers: { authorization: `Bearer ${accessToken}` },
          credentials: "omit",
        });
        const userInfo = (await userInfoResponse.json()) as Record<string, unknown>;
        if (!userInfoResponse.ok) {
          throw new Error(t("The access token could not be used to read UserInfo."));
        }

        setResult({
          name: typeof userInfo.name === "string" ? userInfo.name : undefined,
          email: typeof userInfo.email === "string" ? userInfo.email : undefined,
          picture: typeof userInfo.picture === "string" ? userInfo.picture : undefined,
          accessTokenReceived: true,
          refreshTokenReceived: typeof token.refresh_token === "string",
        });
        setStatus("success");
        setStatusMessage(t("Your Deni AI identity was returned successfully."));
        window.sessionStorage.removeItem(PLAYGROUND_STORAGE_KEY);
      } catch (error) {
        setStatus("error");
        setStatusMessage(localizeError(error, t("The OAuth flow could not be completed.")));
        window.sessionStorage.removeItem(PLAYGROUND_STORAGE_KEY);
      }
    };

    void completeFlow();
  }, []);

  const startFlow = async () => {
    const normalizedClientId = clientId.trim();
    const normalizedRedirectUri = redirectUri.trim();
    setResult(null);

    if (!normalizedClientId) {
      setStatus("error");
      setStatusMessage(t("Enter a registered public client ID to continue."));
      return;
    }
    if (!isValidRedirectUri(normalizedRedirectUri)) {
      setStatus("error");
      setStatusMessage(
        t("Use a valid HTTPS callback URL, or HTTP on localhost during development."),
      );
      return;
    }

    const { verifier, challenge } = await createPkce();
    const state = randomString(24);
    const flow: StoredFlow = {
      clientId: normalizedClientId,
      redirectUri: normalizedRedirectUri,
      state,
      verifier,
    };
    window.sessionStorage.setItem(PLAYGROUND_STORAGE_KEY, JSON.stringify(flow));

    const authorizeUrl = new URL("/api/auth/oauth2/authorize", window.location.origin);
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: normalizedClientId,
      redirect_uri: normalizedRedirectUri,
      scope: DEFAULT_SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();

    setStatus("starting");
    setStatusMessage(t("Opening the Deni AI authorization screen…"));
    window.location.assign(authorizeUrl.toString());
  };

  const isBusy = status === "starting" || status === "processing";

  return (
    <div className="overflow-hidden rounded-[2rem] border border-border/80 bg-card shadow-[0_24px_80px_-40px_hsl(var(--foreground)/0.55)]">
      <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border-b border-border/70 p-6 sm:p-8 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-foreground text-background">
                <KeyRound className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">{t("Live OAuth playground")}</p>
                <p className="text-xs text-muted-foreground">{t("Public client · S256 PKCE")}</p>
              </div>
            </div>
            <Badge
              variant={
                status === "error" ? "destructive" : status === "success" ? "default" : "secondary"
              }
            >
              {status === "success" ? (
                <Check />
              ) : status === "error" ? (
                <AlertCircleIcon />
              ) : (
                <ShieldCheck />
              )}
              {status === "success"
                ? t("Complete")
                : status === "error"
                  ? t("Needs attention")
                  : t("Ready")}
            </Badge>
          </div>

          <div className="mt-8 space-y-5">
            <div className="space-y-2">
              <label htmlFor="oauth-example-client-id" className="text-sm font-medium">
                {t("Public client ID")}
              </label>
              <Input
                id="oauth-example-client-id"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder={t("Paste the client_id from your Deni AI registration")}
                autoComplete="off"
                spellCheck={false}
                disabled={isBusy}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {t(
                  "Use a public client with token_endpoint_auth_method set to none. Never paste a client secret here.",
                )}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="oauth-example-redirect-uri" className="text-sm font-medium">
                {t("Callback URL")}
              </label>
              <Input
                id="oauth-example-redirect-uri"
                value={redirectUri}
                onChange={(event) => setRedirectUri(event.target.value)}
                placeholder="https://your-app.example.com/oauth/callback"
                autoComplete="url"
                spellCheck={false}
                disabled={isBusy}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {t(
                  "Register this exact URL on the OAuth client. For this page, use the current page URL.",
                )}
              </p>
            </div>

            <Button className="w-full" onClick={() => void startFlow()} disabled={isBusy}>
              {isBusy ? <LoaderCircle className="animate-spin" /> : <ArrowUpRight />}
              {isBusy ? t("Preparing secure sign in…") : t("Start secure sign in")}
            </Button>

            {statusMessage ? (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                  status === "error"
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : status === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border bg-muted/40 text-muted-foreground"
                }`}
                role={status === "error" ? "alert" : "status"}
              >
                {statusMessage}
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative flex min-h-[320px] flex-col justify-between overflow-hidden bg-foreground p-6 text-background sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--background)/0.22),transparent_68%)]" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 size-64 rounded-full bg-[radial-gradient(circle_at_center,hsl(42_96%_64%/0.32),transparent_68%)]" />
          {result ? (
            <div className="relative flex h-full flex-col">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-background/55">
                {t("Identity response")}
              </p>
              <div className="mt-7 flex items-center gap-4">
                {result.picture ? (
                  // OAuth providers control this image URL; keep it inside a plain img to avoid remote image configuration.
                  <img
                    src={result.picture}
                    alt=""
                    className="size-14 rounded-2xl object-cover ring-1 ring-background/20"
                  />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-background/10 text-xl font-semibold">
                    {(result.name ?? result.email ?? "D").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">
                    {result.name ?? t("Deni AI user")}
                  </p>
                  <p className="truncate text-sm text-background/65">
                    {result.email ?? t("Email not included")}
                  </p>
                </div>
              </div>
              <div className="mt-8 grid gap-2 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-background/10 px-4 py-3">
                  <span className="text-background/65">{t("Access token")}</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                    <Check className="size-4" />
                    {t("Received")}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-background/10 px-4 py-3">
                  <span className="text-background/65">{t("Refresh token")}</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                    <Check className="size-4" />
                    {result.refreshTokenReceived ? t("Received") : t("Not requested")}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                className="mt-auto border-background/20 bg-transparent text-background hover:bg-background/10 hover:text-background"
                onClick={() => {
                  setResult(null);
                  setStatus("idle");
                  setStatusMessage("");
                }}
              >
                <RotateCcw />
                {t("Start another sign in")}
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-background/55">
                  {t("What the client receives")}
                </p>
                <div className="mt-7 space-y-4 font-mono text-sm">
                  <div className="flex items-center gap-3 text-background/80">
                    <span className="size-2 rounded-full bg-emerald-300" />
                    openid
                  </div>
                  <div className="flex items-center gap-3 text-background/80">
                    <span className="size-2 rounded-full bg-amber-300" />
                    profile
                  </div>
                  <div className="flex items-center gap-3 text-background/80">
                    <span className="size-2 rounded-full bg-sky-300" />
                    email
                  </div>
                </div>
              </div>
              <div className="relative mt-10 rounded-2xl border border-background/15 bg-background/10 p-4 text-sm leading-6 text-background/70">
                {t(
                  "The page keeps the tokens in memory only long enough to confirm the exchange, then discards them.",
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
