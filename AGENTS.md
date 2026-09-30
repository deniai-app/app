# Agent guide for deni-ai

pnpm, Node.js 22.18+, Next.js App Router, React Compiler, strict TypeScript, Tailwind v4,
shadcn/ui, Drizzle/Postgres, and better-auth.

## Task boundaries

Complete the requested change and relevant verification, fixing issues caused by
the change before handing it back. Routine local edits and checks do not need
additional approval. Ask when missing information affects scope or an external
action is not already authorized.

Keep changes scoped. Preserve unrelated work. Do not add heavyweight dependencies
or change the toolchain without approval. Do not commit or create branches unless
requested; see the Git policy below.

## Sources of truth

Read these when relevant rather than loading the whole project:

- Commands and dependency versions: `package.json` (pnpm required).
- Environment validation: `src/env.ts`; setup: `.env.example` and `SETUP.md`.
  Optional empty strings are treated as unset. Never hardcode secrets.
- Database: `src/db/schema/`, `src/db/schema/index.ts`, `drizzle.config.ts`;
  generated SQL: `migrations/`. Runtime uses a pooled Postgres URL.
- Auth: `src/lib/auth.ts` and `src/lib/auth-client.ts`.
  Change the client baseURL only when requested.
  `pnpm run auth:generate` overwrites `src/db/schema/auth-schema.ts`.
- Task-specific workflows: `.agents/skills/`; load only the applicable skill and
  references.

## Project conventions

- Match neighboring code: named exports where practical, kebab-case files, and
  `@/*` imports. Keep TypeScript strict.
- Pages/layouts: `src/app/`; shared components: `src/components/`; reusable
  logic: `src/lib/`; hooks: `src/hooks/`.
- Keep edits to generated `src/components/ui/` minimal and API-compatible.
- Use `next-intl` (including `useExtracted()`) for user-facing copy. Keep
  `messages/en.json` and `messages/ja.json` keys synchronized, preserving
  placeholders and ICU syntax. Avoid locale-conditional copy when translations
  can express it.
- Update related documentation when changing user-facing behavior, environment
  configuration, deployment, or architecture.
- Respond in the user's language; write code and identifiers in English.

## Verification

Choose checks that establish the changed behavior:

- Documentation/skill-only edits: check formatting, links, and instruction
  consistency; no app build or dev server is needed.
- Code changes: `pnpm run lint`, `pnpm run format`, and `pnpm run typecheck`.
  Review formatter changes for unrelated edits.
- Runtime/UI changes: use an existing dev server or `pnpm dev` and exercise the
  affected route. Use `pnpm run build` for build/prerender/configuration changes.
- Schema changes: `pnpm run db:generate`, then inspect the generated SQL.
  Apply migrations only when requested for the target environment:
  `db:migrate:dev` loads `.env.local`; `db:migrate` loads `.env.production`.
  Do not infer permission to apply migrations or use `db:push` from schema edits.

Report what was checked and any remaining blockers. Rerun affected checks after
fixes; avoid repeating successful checks without a relevant change.

## Git policy

Daily work lands directly on `canary`; `master` is the release target.

When commit/push/PR work is requested, update local `canary` from its remote while
preserving local changes, commit scoped changes with a conventional message, and
push to `origin/canary`. Do not create a feature branch or a PR into `canary`
unless explicitly requested.

After landing on `canary`, reuse or create a promotion PR with base `master` and
head `canary`. Merge it when merge/instant merge was requested. Summarize the
promoted changes and verification. Never force-push shared branches unless
explicitly requested.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
