import { passkeyClient } from "@better-auth/passkey/client";
import {
  anonymousClient,
  lastLoginMethodClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { TWO_FACTOR_PATH } from "@/lib/auth-paths";

export { TWO_FACTOR_PATH, TWO_FACTOR_VIEW_PATH } from "@/lib/auth-paths";

const baseURL = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
if (!baseURL) {
  throw new Error("NEXT_PUBLIC_BETTER_AUTH_URL is required");
}

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    anonymousClient(),
    twoFactorClient({
      // Prefer SPA navigation when possible; fall back is still a hard assign so
      // users never land on /chat without a completed second factor.
      onTwoFactorRedirect() {
        if (typeof window === "undefined") return;
        // Keep any explicit redirectTo attached to the challenge page.
        window.location.assign(`${TWO_FACTOR_PATH}${window.location.search}`);
      },
    }),
    lastLoginMethodClient(),
    passkeyClient(),
    organizationClient(),
  ],
});
