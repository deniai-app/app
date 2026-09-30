Generate and review database migrations.

1. Run `pnpm run db:generate` to generate migration files from schema changes in `src/db/schema/`.
2. Read the generated SQL and summarize the migration for review.
3. If the user explicitly asked to apply migrations, run `pnpm run db:migrate`.
4. Otherwise, stop after generation and report the next apply command.
