/**
 * Minimal Sign in with Deni AI OAuth/OIDC client.
 *
 * Register the callback URI first, then run:
 *
 *   DENI_AI_OAUTH_CLIENT_ID=... \
 *   DENI_AI_OAUTH_CLIENT_SECRET=... \
 *   pnpm run oauth:example
 *
 * Public clients omit DENI_AI_OAUTH_CLIENT_SECRET. The example uses an exact
 * loopback callback and S256 PKCE, then calls UserInfo with the access token.
 */

import { createServer } from "node:http";

const origin = new URL(process.env.DENI_AI_ORIGIN ?? "http://localhost:3000");
origin.pathname = origin.pathname.replace(/\/$/, "");

const clientId = process.env.DENI_AI_OAUTH_CLIENT_ID?.trim();
if (!clientId) {
  throw new Error("DENI_AI_OAUTH_CLIENT_ID is required");
}

const clientSecret = process.env.DENI_AI_OAUTH_CLIENT_SECRET?.trim();
const callbackPort = Number(process.env.DENI_AI_CALLBACK_PORT ?? "8787");
if (!Number.isInteger(callbackPort) || callbackPort < 1 || callbackPort > 65_535) {
  throw new Error("DENI_AI_CALLBACK_PORT must be a valid TCP port");
}

const redirectUri =
  process.env.DENI_AI_REDIRECT_URI?.trim() ?? `http://127.0.0.1:${callbackPort}/callback`;
const scope = process.env.DENI_AI_SCOPE?.trim() || "openid profile email offline_access";

function randomString(byteLength = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(byteLength))).toString("base64url");
}

async function createPkce() {
  const verifier = randomString(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: Buffer.from(digest).toString("base64url") };
}

async function exchangeCode(code: string, verifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (clientSecret) {
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    );
  } else {
    body.set("client_id", clientId);
  }

  const response = await fetch(new URL("/api/auth/oauth2/token", origin), {
    method: "POST",
    headers,
    body,
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : undefined;
  if (!accessToken) throw new Error("Token response did not include access_token");

  const userInfoResponse = await fetch(new URL("/api/auth/oauth2/userinfo", origin), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const userInfo = (await userInfoResponse.json()) as Record<string, unknown>;
  if (!userInfoResponse.ok) {
    throw new Error(`UserInfo failed (${userInfoResponse.status}): ${JSON.stringify(userInfo)}`);
  }

  return { payload, userInfo };
}

const { verifier, challenge } = await createPkce();
const state = randomString(24);
const authorizeUrl = new URL("/api/auth/oauth2/authorize", origin);
authorizeUrl.search = new URLSearchParams({
  response_type: "code",
  client_id: clientId,
  redirect_uri: redirectUri,
  scope,
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
}).toString();

let resolveResult!: (value: Awaited<ReturnType<typeof exchangeCode>>) => void;
let rejectResult!: (reason: Error) => void;
const resultPromise = new Promise<Awaited<ReturnType<typeof exchangeCode>>>((resolve, reject) => {
  resolveResult = resolve;
  rejectResult = reject;
});

const callbackPath = new URL(redirectUri).pathname;
async function handleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== callbackPath) return new Response("Not found", { status: 404 });

  const returnedState = url.searchParams.get("state");
  if (returnedState !== state) {
    const error = new Error("OAuth state validation failed");
    rejectResult(error);
    return new Response(error.message, { status: 400 });
  }

  const providerError = url.searchParams.get("error");
  if (providerError) {
    const description = url.searchParams.get("error_description");
    const error = new Error(
      `Authorization failed: ${providerError}${description ? ` (${description})` : ""}`,
    );
    rejectResult(error);
    return new Response(error.message, { status: 400 });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    const error = new Error("Authorization response did not include a code");
    rejectResult(error);
    return new Response(error.message, { status: 400 });
  }

  try {
    resolveResult(await exchangeCode(code, verifier));
    return new Response("Sign in complete. You can close this tab.", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    rejectResult(normalized);
    return new Response(normalized.message, { status: 502 });
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${callbackPort}`);
  void handleCallback(new Request(url))
    .then(async (result) => {
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
    })
    .catch((error: unknown) => {
      response.writeHead(500);
      response.end("OAuth callback failed");
      rejectResult(error instanceof Error ? error : new Error(String(error)));
    });
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(callbackPort, "127.0.0.1", resolve);
});

console.log(`Listening for the OAuth callback on ${redirectUri}`);
console.log("Open this URL in a browser, sign in, and approve the requested scopes:");
console.log(authorizeUrl.toString());

try {
  const result = await resultPromise;
  console.log(
    JSON.stringify(
      {
        accessTokenReceived: typeof result.payload.access_token === "string",
        refreshTokenReceived: typeof result.payload.refresh_token === "string",
        userInfo: result.userInfo,
      },
      null,
      2,
    ),
  );
} finally {
  server.close();
}
