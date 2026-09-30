# Deni AI

> **AI Chatbot for Everyone** — access modern AI models in one place

Deni AI is a multi-model AI chat app for people who want strong model choice without juggling many separate subscriptions. It supports OpenAI, Anthropic, Google, Groq, xAI, and more through platform-managed provider connections.

**Live app:** [https://deniai.app](https://deniai.app)

## Features

- **Multi-model chat** — switch between OpenAI, Claude, Gemini, Groq, xAI, and other routed models
- **Chat history** — the sidebar includes all conversation summaries, including older pinned and filed chats; message bodies load separately. Retry instructions apply only to explicit regeneration requests.
- **Tools** — web search (Exa) is available on every chat and used when current information is needed; each search call consumes a fixed amount of basic usage (Search mode forces a lookup). Page browse and agent-led interactive questionnaires for clarifications. Image and video generation are not supported; historical tool results still render in chat history, but retired Veo download URLs are no longer served
- **Memory & projects** — personalization memories and project-scoped context; projects can be shared with a team
- **Teams** — organizations, seats, shared Pro or Max access (per-seat billing), and team projects
- **Billing** — Stripe subscriptions (personal and team) plus Max Mode metered overage; scheduled cancellations keep the current paid plan through the period end, with an animated cancellation receipt. Enabling Max Mode requires an active subscription; cancellation, trial, and past-due states are not eligible. Optional self-host disable via `NEXT_PUBLIC_BILLING_DISABLED`
- **Affiliate referrals** — shareable invite links, QR codes, milestone reset credits, and selectable paid-plan rewards (three resets or a manually sent 30% OFF coupon)
- **Auth** — Google / GitHub sign-in, Deni AI OAuth 2.1 / OpenID Connect provider, magic link, anonymous guest, passkeys, and 2FA (better-auth)
- **History APIs** — security and team audit logs use `{ createdAt, id }` cursors to preserve events with identical timestamps. Pass `nextCursor` unchanged when requesting another page.
- **Ads** — Chat Home shows a 300×250 Meax ad below the composer only for confirmed Free users (including anonymous guests). Paid users and users whose plan is still loading do not load the ad SDK. The React component comes from [Meax App Ads](https://maa-sdk.dstk.jp/react/MeaxAdUnit.tsx).
- **i18n** — English and Japanese (`next-intl`)
- **Public guides & blog** — original articles on model choice, verification, and practical AI use, available without an account
- **PWA** — installable progressive web app assets and service worker

## Tech stack

| Area      | Choice                                            |
| --------- | ------------------------------------------------- |
| Framework | Next.js 16 (App Router, React 19, React Compiler) |
| Language  | TypeScript (strict)                               |
| Runtime   | Node.js 22.18+ (pnpm 12.8.1)                      |
| UI        | Tailwind CSS v4, shadcn/ui (Base UI)              |
| API       | tRPC + TanStack Query                             |
| DB        | PostgreSQL (Neon recommended) + Drizzle ORM       |
| Auth      | better-auth                                       |
| Billing   | Stripe                                            |
| AI        | Vercel AI SDK + provider SDKs / OpenRouter        |

## Quick start

```bash
# Clone
git clone https://github.com/deniaiapp/app.git
cd deni-ai

# Install
pnpm install

# Configure (copy example and fill the core values plus any optional features)
cp .env.example .env.local

# Database
pnpm run db:migrate:dev   # local: uses .env.local
# or: pnpm run db:push

# Dev server → http://localhost:3000
pnpm dev
```

Full prerequisites, environment variables, Stripe, OAuth, and deployment steps: **[SETUP.md](SETUP.md)**.

**Self-hosting database:** we recommend [Neon](https://neon.tech). The app is already wired for Neon serverless Postgres.

## Documentation

| Doc                                      | Purpose                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| [SETUP.md](SETUP.md)                     | Env vars, database, Stripe, Docker / Dokploy, scripts |
| [CONTRIBUTING.md](CONTRIBUTING.md)       | Contributor workflow and coding standards             |
| [SECURITY.md](SECURITY.md)               | Vulnerability reporting                               |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community guidelines                                  |
| [AGENTS.md](AGENTS.md)                   | Agent / AI-assisted development guide                 |

## Project layout (high level)

```
src/
  app/           # Next.js App Router (marketing, chat, settings, API)
  components/    # UI, chat, auth, billing, team
  db/schema/     # Drizzle schemas
  lib/           # Auth, billing, chat, tools, providers
  server/api/    # tRPC routers
messages/        # en.json, ja.json
migrations/      # Drizzle SQL migrations
packages/        # Workspace packages (e.g. disposable-email-domains)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Day-to-day development targets the **`canary`** branch; **`master`** is the release/promotion target.

```bash
pnpm run lint
pnpm run format
pnpm run typecheck
pnpm test
pnpm run build
```

## License

MIT License — see [LICENSE](LICENSE).

## Sponsors

If Deni AI is useful to you, consider supporting development on GitHub Sponsors:

[https://github.com/sponsors/raicdev](https://github.com/sponsors/raicdev)

Sponsorships help cover hosting, infrastructure, and ongoing maintenance so we can keep improving free and accessible AI chat.

## Support

For issues, questions, or suggestions, please open a GitHub [issue](https://github.com/deniaiapp/app/issues) or [discussion](https://github.com/deniaiapp/app/discussions).

Security vulnerabilities: report privately per [SECURITY.md](SECURITY.md) — do not use public issues.
