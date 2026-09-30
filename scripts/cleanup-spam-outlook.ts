/**
 * Delete Microsoft free-mail users whose local part matches the alias/bot-farm
 * heuristics from email-domain-policy (plus tags, fragmented dots, random blobs).
 *
 * Usage:
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/cleanup-spam-outlook.ts --production           # dry-run
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/cleanup-spam-outlook.ts --production --apply   # delete
 *
 * Skips users with an active personal paid plan. Stripe customers are not touched.
 */

import { existsSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import {
  extractEmailDomain,
  extractEmailLocalPart,
  isAliasLikeLocalPart,
  isMicrosoftMailDomain,
} from "../src/lib/email-domain-policy";

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  email_verified: boolean;
  created_at: string | Date;
};

function readDatabaseUrlFromFile(path: string): string | null {
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^DATABASE_URL\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

function loadDatabaseUrl() {
  const preferProduction = process.argv.includes("--production");
  const candidates = preferProduction
    ? [".env.production", ".env.local", ".env"]
    : process.env.DATABASE_URL
      ? []
      : [".env.local", ".env.production", ".env"];

  for (const path of candidates) {
    const value = readDatabaseUrlFromFile(path);
    if (value) {
      console.log(`Using DATABASE_URL from ${path}`);
      return value;
    }
  }
  if (process.env.DATABASE_URL) {
    console.log("Using DATABASE_URL from process.env");
    return process.env.DATABASE_URL;
  }
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = loadDatabaseUrl();
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = neon(url);
  const rows = (await sql`
    SELECT id, name, email, email_verified, created_at
    FROM "user"
    WHERE email IS NOT NULL
      AND (
        email ILIKE '%@outlook.com'
        OR email ILIKE '%@outlook.jp'
        OR email ILIKE '%@hotmail.com'
        OR email ILIKE '%@hotmail.co.jp'
        OR email ILIKE '%@live.com'
        OR email ILIKE '%@live.jp'
        OR email ILIKE '%@msn.com'
      )
    ORDER BY created_at DESC
  `) as UserRow[];

  // Deletion is stricter than signup policy: only high-confidence farm patterns.
  // Plus-address aliases on free Microsoft mail are the bulk of the bot wave.
  // Pure "letters+digits" locals (e.g. nana0464@outlook.jp) can be real users —
  // they stay for manual review.
  const spam = rows.filter((row) => {
    const domain = extractEmailDomain(row.email);
    const local = extractEmailLocalPart(row.email);
    if (!domain || !local || !isMicrosoftMailDomain(domain)) return false;
    if (!isAliasLikeLocalPart(local)) return false;
    // Require plus-tag (alias farm) for automatic deletion.
    return local.includes("+");
  });

  // Skip anyone currently on a paid personal plan
  const paid = (await sql`
    SELECT user_id, plan_id, status
    FROM billing
    WHERE organization_id IS NULL
      AND plan_id IS NOT NULL
      AND status IN ('active', 'trialing', 'past_due', 'paid')
  `) as { user_id: string; plan_id: string; status: string }[];
  const paidByUser = new Map(paid.map((row) => [row.user_id, row]));

  const targets: UserRow[] = [];
  const skippedPaid: Array<UserRow & { plan_id: string; status: string }> = [];
  for (const row of spam) {
    const plan = paidByUser.get(row.id);
    if (plan) {
      skippedPaid.push({ ...row, plan_id: plan.plan_id, status: plan.status });
      continue;
    }
    targets.push(row);
  }

  console.log(`Microsoft free-mail users scanned: ${rows.length}`);
  console.log(`Alias/bot-farm pattern matches: ${spam.length}`);
  console.log(`Skipped (active paid plan): ${skippedPaid.length}`);
  console.log(`Delete targets: ${targets.length}`);

  if (skippedPaid.length > 0) {
    console.log("\nSkipped paid:");
    for (const row of skippedPaid) {
      console.log(`  ${row.email}  plan=${row.plan_id} status=${row.status}`);
    }
  }

  console.log("\nTargets:");
  for (const row of targets) {
    const created =
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
    console.log(
      `  ${created} | ${row.email_verified ? "V" : "U"} | ${row.email} | ${JSON.stringify(row.name)} | ${row.id}`,
    );
  }

  if (targets.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to delete.");
    return;
  }

  const ids = targets.map((row) => row.id);
  const CHUNK = 100;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const result = (await sql`DELETE FROM "user" WHERE id = ANY(${slice}) RETURNING id, email`) as {
      id: string;
      email: string;
    }[];
    deleted += result.length;
    for (const row of result) {
      console.log(`  deleted ${row.email}`);
    }
  }

  console.log(`\nDeleted ${deleted} spam Outlook/Microsoft user rows (cascades applied).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
