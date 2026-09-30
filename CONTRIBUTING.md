# Contributing to Deni AI

Thank you for your interest in contributing to Deni AI! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Internationalization](#internationalization)
- [Customization](#customization)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). We expect all contributors to adhere to these guidelines to maintain a welcoming and inclusive community.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Set up the development environment (see below)
4. Create a new branch from **`canary`** (not `master`) for your feature or fix

Day-to-day development targets **`canary`**. **`master`** is the promotion/release branch.

## Development Setup

### Prerequisites

- [Node.js 22.18+](https://nodejs.org/) and [pnpm 12.8.1](https://pnpm.io/installation)
- PostgreSQL (we recommend [Neon](https://neon.tech/) for serverless PostgreSQL)
- API keys and OAuth credentials as described in [SETUP.md](SETUP.md)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USER/deni-ai.git
cd deni-ai

# Use canary as the base
git checkout canary
git pull origin canary

# Install dependencies
pnpm install

# Environment
cp .env.example .env
# Edit .env with your configuration (see SETUP.md / src/env.ts)

# Database (local)
pnpm run db:migrate:dev
# or: pnpm run db:push

# Dev server → http://localhost:3000
pnpm dev
```

### Environment variables

Required and optional variables are validated in `src/env.ts`. A starter list is in `.env.example`. Key groups:

- **Core:** `DATABASE_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (32 chars)
- **OAuth (optional):** Google + GitHub client ID/secret; missing provider pairs hide those buttons. Deni AI's OAuth 2.1 / OpenID Connect provider is enabled by default and uses the existing auth secret and database.
- **AI (optional):** `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`
- **Search / CAPTCHA (optional):** `EXA_API_KEY`, Turnstile keys
- **Stripe (optional):** `STRIPE_SECRET_KEY`; missing Stripe keys disable billing
- **Optional:** Cloudflare Email Sending, Upstash/KV Redis, UploadThing, AdSense, voids.top gateway

Details: [SETUP.md](SETUP.md).

## How to Contribute

### Quick contribution flow

1. Fork the repository
2. Branch from `canary`: `git checkout -b feature/amazing-feature`
3. Follow coding conventions in [AGENTS.md](AGENTS.md)
4. Run checks:

   ```bash
   pnpm run lint
   pnpm run format
   pnpm run typecheck
   ```

5. Commit with [Conventional Commits](https://www.conventionalcommits.org/)
6. Push and open a Pull Request with **base = `canary`**

### Types of contributions

- **Bug fixes** — stability and correctness
- **Features** — new capabilities aligned with the product
- **Documentation** — guides, fixes, examples
- **Performance** — load time, streaming, React Compiler–friendly patterns
- **i18n** — keep `messages/en.json` and `messages/ja.json` in sync

### Before you start

1. Check existing [issues](https://github.com/deniaiapp/app/issues) and [pull requests](https://github.com/deniaiapp/app/pulls)
2. For major changes, open an issue first
3. Keep PRs focused; avoid unrelated refactors

## Pull Request Process

1. **Branch name** — e.g. `feature/add-new-provider`, `fix/chat-loading-issue`

2. **Validate**

   ```bash
   pnpm run lint
   pnpm run format
   pnpm run typecheck
   pnpm run build
   ```

3. **Commit messages**

   ```
   feat: add support for new AI provider
   fix: resolve chat message ordering issue
   docs: update setup guide for Docker
   ```

4. **Open a PR against `canary`**
   - Clear description and linked issues
   - Screenshots for UI changes
   - Note manual test steps when automated tests are missing

5. **Review** — address maintainer feedback promptly

## Coding Standards

### TypeScript

- Strict TypeScript (project default)
- Avoid `any`; prefer `unknown` and narrow with guards
- Prefer types from tRPC, Drizzle, and Zod schemas

### Code style

- [oxlint](https://oxc.rs/docs/guide/usage/linter) + [oxfmt](https://oxc.rs/docs/guide/usage/formatter)
- Run `pnpm run lint` and `pnpm run format` before committing
- Match existing patterns; prefer named exports where the codebase does

### File naming

- kebab-case files: `auth-client.ts`, `chat-interface.tsx`
- Import with the `@/*` alias from `tsconfig.json`

### React / Next.js

- App Router: Server Components by default
- `"use client"` only when needed
- Respect React Compiler constraints (avoid problematic mutable closures)
- This project uses Next.js canary APIs — check `node_modules/next/dist/docs/` when unsure

### Commit messages

Conventional Commits:

| Prefix      | Use                              |
| ----------- | -------------------------------- |
| `feat:`     | New feature                      |
| `fix:`      | Bug fix                          |
| `docs:`     | Documentation                    |
| `style:`    | Formatting only                  |
| `refactor:` | Refactor without behavior change |
| `test:`     | Tests                            |
| `chore:`    | Maintenance                      |

## Internationalization

Translations live in `messages/` (`en.json`, `ja.json`).

When adding user-facing strings:

1. Add the English key/value (or use `next-intl` extracted messages as the project does)
2. Keep Japanese (`ja.json`) in sync
3. Prefer `useExtracted()` over locale conditionals like `locale === "ja"`

See [AGENTS.md](AGENTS.md) for the full i18n rules.

## Customization

### UI components

shadcn/ui (Base UI). Add components with:

```bash
pnpm dlx shadcn@latest add [component-name]
```

Prefer not to hand-edit generated files under `src/components/ui/` unless necessary.

### Themes

- Theme tokens / presets: `src/app/themes.css`, `src/lib/theme-presets.ts`
- Global styles: `src/app/globals.css`

### AI providers / models

1. Add env keys in `src/env.ts` and `.env.example` if needed
2. Wire the provider in chat / generation libs under `src/lib/`
3. Register models in `src/lib/constants.ts`

### Chat tools

Tools (search, browse, image, video) live under `src/lib/chat-tools/`.

## Reporting Issues

### Bug reports

Include:

- Clear title and steps to reproduce
- Expected vs actual behavior
- Environment (OS, browser, Node.js/pnpm version)
- Logs or screenshots when useful

### Feature requests

Include:

- Problem statement and proposed UX
- Why it fits Deni AI
- Optional implementation notes

### Security

Do **not** file public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).

## Questions?

- [Discussions](https://github.com/deniaiapp/app/discussions)
- [SETUP.md](SETUP.md) and [README.md](README.md)
- Maintainers via issues/PRs

Thank you for contributing to Deni AI!
