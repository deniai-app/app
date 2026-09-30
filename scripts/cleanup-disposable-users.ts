/**
 * One-off cleanup: find and (optionally) delete user rows whose email
 * domain is on the disposable-email blocklist.
 *
 * Usage:
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/cleanup-disposable-users.ts          # dry-run
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/cleanup-disposable-users.ts --apply  # actually delete
 *
 * Reads DATABASE_URL directly to avoid pulling the full @/env Zod schema
 * (which requires the whole server runtime to be configured).
 *
 * Cascades take care of dependent tables (chat, billing, session, etc).
 * Stripe customers on the billing side are NOT touched — clean those
 * up out-of-band if needed.
 */

import { neon } from "@neondatabase/serverless";
import { isDisposableEmail } from "@deni-ai/disposable-email-domains";

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = neon(url);

  const rows = (await sql`SELECT id, email FROM "user"`) as { id: string; email: string }[];
  const targets = rows.filter((row) => row.email && isDisposableEmail(row.email));

  console.log(`Scanned ${rows.length} users; ${targets.length} use disposable domains.`);

  if (targets.length === 0) {
    return;
  }

  console.log("\nSample (up to 20):");
  for (const row of targets.slice(0, 20)) {
    console.log(`  ${row.id}  ${row.email}`);
  }

  // Domain frequency breakdown helps spot mass-abuse patterns at a glance.
  const byDomain = new Map<string, number>();
  for (const row of targets) {
    const at = row.email.lastIndexOf("@");
    if (at === -1) continue;
    const domain = row.email.slice(at + 1).toLowerCase();
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
  }
  const ranked = [...byDomain.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log("\nTop domains:");
  for (const [domain, count] of ranked) {
    console.log(`  ${count.toString().padStart(5)}  ${domain}`);
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to delete.");
    return;
  }

  const ids = targets.map((row) => row.id);
  const CHUNK = 500;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const result = (await sql`DELETE FROM "user" WHERE id = ANY(${slice}) RETURNING id`) as {
      id: string;
    }[];
    deleted += result.length;
  }

  console.log(`\nDeleted ${deleted} user rows (cascades applied).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
