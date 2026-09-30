# Standalone tools

Run scripts from the repository root with pnpm and Node.js (22.18+).

- Use the `tools:*` scripts in root `package.json` when available.
- For other TypeScript files, use `pnpm exec tsx <file>`.
- Load environment files explicitly with `tsx --env-file=.env.local` or
  `--env-file-if-exists=.env.local`; Node.js does not auto-load them.
- Use Node.js built-in APIs (`node:fs`, `node:http`, `node:child_process`).
- Run regression tests with `pnpm test` (Vitest); tests must not contact real
  auth services or databases.
- Do not run destructive maintenance scripts or database migrations without
  explicit authorization for the target environment.
