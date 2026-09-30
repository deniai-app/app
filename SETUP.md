# Setup

This guide covers prerequisites, environment configuration, database setup, Docker / Dokploy, and deployment.

Source of truth for validated env vars: [`src/env.ts`](src/env.ts). Starter template: [`.env.example`](.env.example).

## Prerequisites

- [Node.js 22.18+](https://nodejs.org/) and [pnpm 12.8.1](https://pnpm.io/installation)
- [PostgreSQL](https://neon.tech/) (Neon serverless recommended for self-hosting)
- Core environment values (`DATABASE_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, and a 32-character `BETTER_AUTH_SECRET`)
- Optional API keys for AI providers (Google AI, Anthropic, Groq, OpenRouter)
- Optional Google + GitHub OAuth credentials; the app also exposes Deni AI as an OAuth 2.1 / OpenID Connect provider
- Optional Cloudflare Turnstile site + secret keys
- Optional Exa API key (web search)
- Optional Stripe secret and publishable keys (billing)

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/deniaiapp/app.git
cd deni-ai
```

### 2. Install dependencies

```bash
npm install --global pnpm@12.8.1
pnpm install --frozen-lockfile
```

### 3. Set up environment variables

Copy the example file and fill in the core values plus any optional features:

```bash
cp .env.example .env
# For local overrides used by some scripts:
# cp .env.example .env.local
```

Minimum template (see `.env.example` for the full list):

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# App URL (must match the origin users open in the browser)
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000

# Authentication (BETTER_AUTH_SECRET must be exactly 32 characters)
BETTER_AUTH_SECRET=your-32-character-secret-here
# OAuth is optional; omit a provider pair to hide that sign-in button.
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# AI Providers (optional; missing keys hide dependent models/features)
GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-key
ANTHROPIC_API_KEY=your-anthropic-key
GROQ_API_KEY=gsk_your-groq-key
OPENROUTER_API_KEY=your-openrouter-key

# voids.top gateway (optional)
# VOIDS_MODE=true routes platform OpenAI + Anthropic through voids.top
VOIDS_MODE=
VOIDS_BASE_URL=https://capi.voids.top/v2
VOIDS_API_KEY=

# Deni AI API (OpenAI-compatible). Both required to show DeepSeek / MiniMax models.
DENI_API_KEY=
DENI_API_BASE_URL=

# Search (optional; missing key disables web search)
EXA_API_KEY=your-exa-api-key

# CAPTCHA (optional; omit both to disable Turnstile)
TURNSTILE_SECRET_KEY=your-turnstile-secret
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-turnstile-site-key

# Stripe (optional; missing Stripe keys disable billing)
STRIPE_SECRET_KEY=sk_test_your-stripe-key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
# STRIPE_FLASH_OFFER_COUPON_ID=  # optional promo coupon

# Email — Cloudflare Email Sending (optional — magic link / verification / org invites)
# Onboard deniai.app (or your domain) under Email Service → Email Sending first.
# API token needs Email Sending: Edit. Both vars required to enable email features.
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token

# Affiliate administration (optional; comma-separated server-side admin emails)
# AFFILIATE_ADMIN_EMAILS=you@example.com

# Rate limiting (optional — falls back to in-memory)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# Vercel KV-compatible aliases (also optional)
KV_REST_API_URL=
KV_REST_API_TOKEN=

# File uploads (optional — falls back to base64 data URLs)
UPLOADTHING_TOKEN=

# Optional: hide billing UI / disable paid flows in the client
NEXT_PUBLIC_BILLING_DISABLED=

```

Notes:

- Deni AI Ads: users submit text creatives at `/settings/ads`. The campaign list shows a loading indicator until the initial request finishes, and shows an error with retry instead of a false empty state if loading fails. Advertisers can filter all, active, rejected, or ended campaigns (including exhausted budgets and expired fixed placements), with three campaigns per page; unpaid approved campaigns remain visible under All. OpenRouter AI reviews the text and URL before Stripe checkout; a failed review never enables payment. Stripe's `checkout.session.completed` webhook activates paid campaigns; the advertiser's campaign list also verifies incomplete activations directly with Stripe, so a delayed webhook does not offer a second payment. Set `OPENROUTER_API_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`, and apply the generated ads migration before enabling this feature. Prepaid CPM costs ¥200/1,000 views (¥1 per five unique views); CPC costs ¥30 per unique click; the single fixed chat slot costs ¥3,000 for 30 days. Budgets for CPM/CPC are ¥300–100,000, charged in advance. Stripe Checkout accepts promotion codes for ad payments; discounts reduce the amount charged, not the campaign's prepaid budget or fixed-slot duration. Signed-in free-tier users and anonymous guest sessions see ads (never paid users or the advertiser's own campaign). Anonymous guest views and clicks count as half a billable view/click (¥15 per guest CPC click); normal views count ¥1 per five and guest views count ¥1 per ten. Views are counted only when at least half of the ad is visible; one view/account/campaign/10 minutes and one click/account/campaign/day count for billing. Ads stop when budget is spent. The fixed slot takes priority over rotating campaigns. A single ad appears below the latest completed assistant answer (not on the empty new-chat screen or while a reply is streaming). The next ad is prefetched while the reply is in progress; if the request is still pending at completion, a compact loading state is shown until the ad arrives. Each completed answer requests a different eligible ad when available, otherwise reuses the previous one. Only the clearly labeled ad's "Learn more" button opens the advertiser's site. Titles and descriptions are displayed in at most two lines each; advertisers should put important information first. Ad event rows are used for deduplication; no third-party ad script is loaded. AI review blocks only clearly unsafe categories (e.g. fraud, impersonation, illegal content); ordinary comparative claims and vague slogans are allowed. It checks creative text and the URL, not the destination site's contents. Advertisers choose Japanese or English for the default title/description and may optionally add a title/description variant only in the other language; both versions are AI-reviewed, and the chat banner uses the viewer's app language with the default text as fallback. Existing campaigns without a recorded default language keep their previous language-variant behavior until edited. Advertisers can edit their ad title, description, language variants, and HTTPS destination from the campaign list; changes are AI-reviewed before publication, and a rejected revision leaves the previously approved/live ad unchanged. Rejected unpaid ads can be corrected and reviewed in place. Pricing, budget, and fixed-slot dates cannot be changed through edits. Click tokens bind to the original destination so a pre-edit card never redirects to a different URL. Review policy and refund handling before enabling external paid advertising.
- Remove old `NEXT_PUBLIC_ADSENSE_*` configuration from deployments; AdSense and `ads.txt` are no longer used.

- Empty optional vars are treated as unset (`emptyStringAsUndefined` in `src/env.ts`), which helps Docker / Dokploy builds that inject `""` for missing keys.
- Provider keys are capability switches: missing `ANTHROPIC_API_KEY` falls back to OpenRouter, missing `GOOGLE_GENERATIVE_AI_API_KEY` disables memory, missing `EXA_API_KEY` disables web search, and missing Stripe keys disables billing.
- Guest sessions use only `gpt-5.6-luna` and have twice the basic request allowance of the standard guest limit (40 requests).
- Each web `search` tool call consumes 10,000 basic tokens (1 basic request for guests). Failed searches are refunded. Browse does not consume a separate search charge. Image and video generation have been removed.
- Browse validates every redirect and pins direct HTTP(S) connections to validated public DNS answers. Direct and reader responses are limited to 2,000,000 bytes while streaming. The direct path uses Node HTTP(S), so it requires the Node.js runtime.
- API key creation and device authorization share an account-row lock inside a PostgreSQL transaction; the five-key cap applies across instances. No schema migration is needed for this lock.
- `pnpm test` includes both `tools/*.test.ts` and `src/**/*.test.ts`.
- When adding or changing supported models, update `src/lib/constants.ts`.
- `OPENROUTER_API_KEY` routes OpenAI-family and other OpenRouter models when voids mode is off. It also serves as the Anthropic fallback when `ANTHROPIC_API_KEY` is absent.
- Optional voids.top mode: set `VOIDS_MODE=true` (or `1`) and provide **`VOIDS_API_KEY`** to send OpenAI and Anthropic traffic through the OpenAI-compatible voids.top gateway. Without the key, normal provider routing is used. Optional `VOIDS_BASE_URL` (default `https://capi.voids.top/v2`). When `VOIDS_MODE` is off, OpenAI uses OpenRouter and Anthropic uses its native key when present, otherwise OpenRouter.
- Optional Deni AI API: set **`DENI_API_KEY`** and **`DENI_API_BASE_URL`** (OpenAI-compatible Chat Completions endpoint) to expose DeepSeek V4, DeepSeek V4 Pro, and MiniMax M3. Missing either value hides those models.
- Affiliate administration: set `AFFILIATE_ADMIN_EMAILS` to a comma-separated list of account emails that can approve reset rewards, grant reset credits, and send manual affiliate coupon emails. The address is read only on the server.
- Blog administration: set `BLOG_ADMIN_EMAILS` to a comma-separated list of account emails that can write and publish posts at `/settings/blog`. If omitted, `AFFILIATE_ADMIN_EMAILS` is used.
- New 30% OFF affiliate coupon rewards remain pending until an admin enters a Stripe coupon or promotion code and sends the email from the affiliate settings page.
- **Email (Cloudflare Email Sending):** requires a Workers Paid plan and the sending domain (e.g. `deniai.app`) onboarded under **Email Service → Email Sending** in the Cloudflare dashboard (DNS/SPF/DKIM managed there). Create an API token with **Email Sending: Edit**, then set `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`. From address defaults to `Deni AI <noreply@deniai.app>` (`EMAIL_FROM` in `src/lib/constants.ts`). When either env var is missing, magic link / verification / invite emails are disabled.

#### Generate `BETTER_AUTH_SECRET`

The secret must be **exactly 32 characters** (Zod `length(32)`):

```bash
# 32 hex chars
openssl rand -hex 16

# or base64 truncated to 32
openssl rand -base64 24 | cut -c1-32
```

#### Setting up OAuth providers

**Google OAuth**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select an existing one)
3. Configure the OAuth consent screen
4. Create OAuth 2.0 Client ID (Web application)
5. Authorized redirect URI: `{NEXT_PUBLIC_BETTER_AUTH_URL}/api/auth/callback/google`  
   Local example: `http://localhost:3000/api/auth/callback/google`

**GitHub OAuth**

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Authorization callback URL: `{NEXT_PUBLIC_BETTER_AUTH_URL}/api/auth/callback/github`  
   Local example: `http://localhost:3000/api/auth/callback/github`

#### Providing Sign in with Deni AI

Deni AI can act as an OAuth 2.1 authorization server for external applications. The provider uses the authorization-code flow with S256 PKCE and exposes OpenID Connect identity claims when the `openid` scope is requested. No additional environment variables are required; the provider uses the existing Better Auth secret and database, and `NEXT_PUBLIC_BETTER_AUTH_URL` is the issuer origin.

Discovery endpoints (the canonical issuer is `{NEXT_PUBLIC_BETTER_AUTH_URL}/api/auth`):

- OpenID Connect: `{NEXT_PUBLIC_BETTER_AUTH_URL}/api/auth/.well-known/openid-configuration`
- OAuth authorization server: `{NEXT_PUBLIC_BETTER_AUTH_URL}/.well-known/oauth-authorization-server/api/auth`
- Root aliases: `{NEXT_PUBLIC_BETTER_AUTH_URL}/.well-known/openid-configuration` and `{NEXT_PUBLIC_BETTER_AUTH_URL}/.well-known/oauth-authorization-server`
- Issuer for an OAuth client: `{NEXT_PUBLIC_BETTER_AUTH_URL}/api/auth`

The metadata advertises these endpoints under the Better Auth API path:

- Authorization: `{NEXT_PUBLIC_BETTER_AUTH_URL}/api/auth/oauth2/authorize`
- Token: `{NEXT_PUBLIC_BETTER_AUTH_URL}/api/auth/oauth2/token`
- UserInfo: `{NEXT_PUBLIC_BETTER_AUTH_URL}/api/auth/oauth2/userinfo`

The supported scopes are `openid`, `profile`, `email`, and `offline_access`. The server accepts `authorization_code` and `refresh_token` grants and requires S256 PKCE for authorization-code requests.

Client registrations are intentionally not open to unauthenticated callers. Developers with a permanent Deni AI account can create and manage up to 10 applications at `{NEXT_PUBLIC_BETTER_AUTH_URL}/settings/developer`. The page supports public PKCE and confidential clients, exact callback URLs, scope management, one-time secret display, secret rotation, editing, and deletion.

Both registration APIs require an authenticated Deni AI session; `adminCreateOAuthClient` is server-only, but it still needs the operator session headers. The sample below is useful for administrative provisioning and assumes `operatorHeaders` contains those authenticated Better Auth headers:

```ts
import { auth } from "@/lib/auth";

const client = await auth.api.adminCreateOAuthClient({
  headers: operatorHeaders,
  body: {
    client_name: "Example application",
    client_uri: "https://example.com",
    redirect_uris: ["https://example.com/oauth/callback"],
    token_endpoint_auth_method: "client_secret_basic",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "openid profile email offline_access",
    application_type: "web",
  },
});

console.log(client.client_id, client.client_secret);
```

Run this only in a trusted server-side maintenance context. Store the returned client secret securely and register the exact callback URL. Do not expose either API call or a client secret in browser code. For a client owned by the currently signed-in user, use `createOAuthClient` with that user's session headers instead.

For a public client, use `token_endpoint_auth_method: "none"` and PKCE. For a confidential web application, use a client authentication method supported by the token endpoint and keep PKCE enabled. The OAuth consent screen validates the signed request before showing the requested scopes, and the user's decision is returned to the registered callback URL.

The hosted interactive playground is available at `{NEXT_PUBLIC_BETTER_AUTH_URL}/oauth/example`. The repository also includes a small Node.js client example at [`examples/sign-in-with-deni-ai.ts`](examples/sign-in-with-deni-ai.ts). Register its loopback callback (`http://127.0.0.1:8787/callback`) on a public client, then run:

```bash
DENI_AI_OAUTH_CLIENT_ID=your-client-id pnpm run oauth:example
```

Add `DENI_AI_OAUTH_CLIENT_SECRET` for a confidential client, or set `DENI_AI_ORIGIN` when the provider is not running at `http://localhost:3000`. The example prints a PKCE authorization URL, waits for the callback, exchanges the code, and calls UserInfo.

To exercise the complete flow against the local development database, start `pnpm dev` in another terminal and run `pnpm run oauth:test`. The test creates temporary records, validates authorization, consent, authorization-code exchange, refresh-token exchange, and UserInfo, then removes the temporary user and cascaded OAuth records.

### 4. Set up the database

```bash
# Generate migration files after schema edits
pnpm run db:generate

# Apply migrations
# Production-style (.env.production):
pnpm run db:migrate

# Local development (.env.local):
pnpm run db:migrate:dev

# Or push schema directly (dev only)
pnpm run db:push
```

Regenerate better-auth tables into `src/db/schema/auth-schema.ts` (overwrites that file):

```bash
pnpm run auth:generate
```

Better Auth 1.7 keys linked accounts by `(issuer, accountId)`. After upgrading, apply the generated migration (adds `account.issuer`, backfills Google / GitHub / credential rows, then creates the unique index) before OAuth sign-in will work.

### 5. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available scripts

| Command                       | Description                          |
| ----------------------------- | ------------------------------------ |
| `pnpm dev`                    | Start Next.js dev server             |
| `pnpm run build`              | Typecheck + production build         |
| `pnpm start`                  | Start production server              |
| `pnpm run lint`               | oxlint                               |
| `pnpm run lint:fix`           | oxlint with auto-fix                 |
| `pnpm run format`             | Format with oxfmt                    |
| `pnpm run typecheck`          | TypeScript check (`tsc --noEmit`)    |
| `pnpm run db:generate`        | Generate Drizzle migrations          |
| `pnpm run db:migrate`         | Migrate using `.env.production`      |
| `pnpm run db:migrate:dev`     | Migrate using `.env.local`           |
| `pnpm run db:push`            | Push schema (dev)                    |
| `pnpm run auth:generate`      | Regenerate better-auth schema        |
| `pnpm run disposable:refresh` | Refresh disposable-email domain list |
| `pnpm run tools:codename`     | Generate version codenames           |
| `pnpm run tools:update-types` | Add missing Lucide type exports      |
| `pnpm run tools:commit`       | AI-assisted conventional commits     |
| `pnpm run doctor`             | Run react-doctor diagnostics         |
| `pnpm test`                   | Run local regression tests (Vitest)  |

TypeScript scripts run through `tsx`. Unlike Bun, Node.js does not automatically load
root environment files: the package scripts explicitly load `.env.local` when appropriate,
and production migrations/maintenance use `.env.production`. For ad-hoc scripts, use
`pnpm exec tsx --env-file=.env.local path/to/script.ts`.

## Stripe billing

Deni AI Ads submission, editing, checkout, and view tracking require the browser `Origin` to match `NEXT_PUBLIC_BETTER_AUTH_URL` (the public origin), even behind a reverse proxy. If these requests return 403 in production, check that the configured URL matches the address in the browser, including scheme and hostname; an internal container URL is not valid. New Stripe checkout and billing portal return URLs use the public origin even if the configured URL ends in `/`; already-open Stripe sessions keep their original return URL until they expire.

Stripe billing is enabled only when the Stripe secret and publishable keys are configured. Checkout UI needs `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Webhooks need `STRIPE_WEBHOOK_SECRET` in production. If the Stripe keys are omitted, billing UI and paid billing procedures are disabled.

1. Create a [Stripe account](https://stripe.com/) and copy API keys
2. Add keys to `.env` (see template above)
3. Webhook endpoint: `{NEXT_PUBLIC_BETTER_AUTH_URL}/api/stripe/webhook`
4. Suggested events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `charge.dispute.created`
   - `charge.dispute.closed`
   - `radar.early_fraud_warning.created`
5. Local forwarding:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

To hide billing in the client:

```env
NEXT_PUBLIC_BILLING_DISABLED=1
```

Optional flash offer coupon: `STRIPE_FLASH_OFFER_COUPON_ID`.

Dispute handling is automatic when those extra webhook events are enabled. On `charge.dispute.created` the app emails admins and cancels the related subscription (immediately for fraud, otherwise at period end). Evidence is not submitted automatically; contest from the Stripe Dashboard if needed. On `radar.early_fraud_warning.created` it refunds as fraud only when the payment is still actionable, 3D Secure did not authenticate it, and the account has no post-payment service use. Alerts go to `AFFILIATE_ADMIN_EMAILS` / `BLOG_ADMIN_EMAILS` when Cloudflare email is configured.

Checkout and card verification always request 3D Secure (`request_three_d_secure: any`), matching the Radar policy that also blocks `:card_3d_secure_support: = 'not_supported'`. A verified card unlocks the full chat model catalog for free accounts (subject to the verified-free token limits); guests remain limited to the guest model. Signed-in free users without a verified card see a reminder at the bottom of the model selector's right panel; it stays visible while scrolling the model list and is hidden for verified-card users, paid users, guests, and deployments with billing disabled.

Keep a Terms of Service URL in Stripe public details (`https://deniai.app/legal/terms`). Optional: turn on [Smart Disputes](https://dashboard.stripe.com/settings/disputes) if you want Stripe to help assemble network evidence.

Anonymous guest sessions cannot use billing endpoints or create Stripe customers; sign in to a permanent account first. Personal billing serializes Stripe customer creation per account and uses account metadata (not email) to find an existing customer. Creation retries are idempotent. On account deletion, team owners must delete their team or transfer ownership first (checked again server-side before Stripe/customer deletion). Active subscriptions block deletion. For a subscription already scheduled to end, users can wait and return after it ends (no automatic account deletion), or delete now and forfeit remaining access without a refund. The delete-user hook cancels pending subscriptions without proration or invoicing and removes personal Stripe customers before the user row is deleted. Team customers remain owned by their organization. Existing duplicate customers are not automatically merged; check their subscriptions and payment methods before manually reconciling them.

Plan prices are resolved by Stripe `lookup_key` matching `src/lib/billing.ts` (`plus_monthly`, `pro_team_yearly`, `max_team_monthly`, and so on). Team plans are licensed per seat. Add Max for Teams by creating prices with lookup keys `max_team_monthly` and `max_team_yearly` (same licensed/seat model as `pro_team_*`). Missing team lookup keys are skipped in the team billing UI; checkout still errors if that specific price is missing.

### Max Mode metered billing

Max Mode overage is billed **monthly** through [Stripe Billing Meters](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api), even when the plan subscription is yearly. Monthly plans get meter items on the same subscription. Yearly plans get a separate monthly Max Mode subscription so Stripe can invoice overage every month.

Create the meters and prices once (idempotent):

```bash
pnpm exec tsx --env-file=.env.local ./tools/stripe-max-mode-setup.ts
```

That script creates:

| Meter event name   | Lookup key               | Rate (USD default)     |
| ------------------ | ------------------------ | ---------------------- |
| `max_mode_basic`   | `max_mode_basic_month`   | $0.01 per 1,000 tokens |
| `max_mode_premium` | `max_mode_premium_month` | $0.05 per 1,000 tokens |

Configure both USD and JPY availability for each Max Mode price (as currency options or matching active prices). The app reads the currency from the customer's active plan subscription: JPY subscriptions use JPY Max Mode prices, while USD subscriptions use USD prices.

Without these lookup keys, Max Mode can still record usage locally but enabling it (and invoicing) fails until the prices exist.

## Database schema

Schemas live under `src/db/schema/`. Main domains:

| Area                                  | Purpose                                       |
| ------------------------------------- | --------------------------------------------- |
| **auth-schema**                       | Users, sessions, accounts, orgs (better-auth) |
| **chat**                              | Conversations and messages                    |
| **provider-keys / provider-settings** | Legacy encrypted BYOK records; no longer used |
| **api-keys**                          | User API key records                          |
| **memory**                            | Personalization memories                      |
| **project**                           | Project context; legacy file records retained |
| **billing**                           | Stripe subscriptions / payment data           |
| **usage**                             | Platform usage and limits                     |
| **share**                             | Legacy chat-share records; links are disabled |
| **team-usage-policy**                 | Team usage policies                           |
| **device-auth**                       | Device / desktop auth                         |

Schema change workflow:

1. Edit files in `src/db/schema/`
2. `pnpm run db:generate`
3. `pnpm run db:migrate` or `pnpm run db:migrate:dev` (or `db:push` in dev)

## Deployment

### Vercel (common for this stack)

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Set the core environment variables and any optional provider keys you want to enable
4. Deploy (build uses `pnpm run build` / `next build` per project settings)

### Docker / Dokploy

A multi-stage `Dockerfile` is included for self-hosting (e.g. Dokploy):

- **Install:** pnpm 12.8.1 (`pnpm-lock.yaml`, `pnpm-workspace.yaml`), with a frozen lockfile.
- **Build:** Node 22 runs `next build` (standalone output). Typecheck is skipped in the image (`SKIP_TYPECHECK=1`) so tsc does not fight Turbopack on small VPS CPUs — run `pnpm run typecheck` locally or in CI.
- The Node builder mounts pnpm-installed dependencies from the install stage instead of copying `node_modules`, avoiding a large per-deploy file copy.
- **Run:** Node 22 serves `.next/standalone` on port **3000**
- Turbopack's `.next/cache` is stored in a BuildKit cache mount, so later deploys on the **same Dokploy host** compile incrementally. Do not enable “disable cache” / `--no-cache` in the service settings.
- `NEXT_PUBLIC_*` values must be present at **build time** (inlined into the client bundle)
- Server secrets should also be available at build time for `@t3-oss/env-nextjs` validation / prerender; optional provider keys can be omitted and disable their features

Dokploy application settings (typical):

| Setting         | Value        |
| --------------- | ------------ |
| Build type      | Dockerfile   |
| Dockerfile path | `Dockerfile` |
| Context         | `.`          |
| Port            | `3000`       |
| Build cache     | enabled      |

Put the same keys as production `.env` in the service **Environment** tab, and pass them as **build-time** args/env for `NEXT_PUBLIC_*` plus any provider keys you want enabled during the build. See comments at the top of `Dockerfile`.

Local example:

```bash
docker build -t deni-ai \
  --build-arg NEXT_PUBLIC_BETTER_AUTH_URL=https://example.com \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=... \
  .

docker run --rm -p 3000:3000 --env-file .env.production deni-ai
```

### Other platforms

Any host that can run a Next.js standalone Node server (Railway, Render, Fly.io, AWS/GCP/Azure, etc.):

- Set the core environment variables and any optional provider keys you want to enable
- Use PostgreSQL (Neon recommended)
- Build: `pnpm run build` (or the Docker image)
- Start: `pnpm start` / `node server.js` (standalone) / container CMD

## Troubleshooting

| Issue                         | What to check                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Env validation errors on boot | Missing keys in `src/env.ts`; empty optional strings are OK                                                                                                                        |
| OAuth redirect mismatch       | Callback URLs must match `NEXT_PUBLIC_BETTER_AUTH_URL`                                                                                                                             |
| Affiliate link is `0.0.0.0`   | Set `NEXT_PUBLIC_BETTER_AUTH_URL` to the **public** HTTPS origin (not Docker `HOSTNAME=0.0.0.0`). Rebuild so `NEXT_PUBLIC_*` is re-inlined. `/invite/*` redirects use that origin. |
| DB migrate fails              | Correct `DATABASE_URL`; use `db:migrate:dev` for local                                                                                                                             |
| Stripe checkout broken        | Publishable key + webhook secret; Stripe CLI for local                                                                                                                             |
| Search / browse tools fail    | Valid `EXA_API_KEY`                                                                                                                                                                |
| Docker build env issues       | Pass `NEXT_PUBLIC_*` as build args; see `Dockerfile` comments                                                                                                                      |
