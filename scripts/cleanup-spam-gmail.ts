/**
 * Delete high-confidence Gmail/Googlemail bot-farm accounts.
 *
 * Usage:
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/cleanup-spam-gmail.ts --production           # dry-run
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/cleanup-spam-gmail.ts --production --apply   # delete
 *
 * Skips users with an active personal paid plan.
 */

import { existsSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import {
  extractEmailLocalPart,
  isAliasLikeLocalPart,
  isGoogleMailDomain,
  extractEmailDomain,
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

function domainOf(email: string): string {
  return extractEmailDomain(email) ?? "";
}

function baseLocal(local: string): string {
  const plus = local.indexOf("+");
  return plus === -1 ? local : local.slice(0, plus);
}

/**
 * High-confidence Gmail farm only — stricter than signup policy so we don't
 * wipe normal users who happen to have digits in their address.
 */
function isGmailFarm(row: UserRow): { hit: boolean; reasons: string[] } {
  const domain = domainOf(row.email);
  if (!isGoogleMailDomain(domain)) return { hit: false, reasons: [] };

  const local = extractEmailLocalPart(row.email);
  if (!local) return { hit: false, reasons: [] };

  const reasons: string[] = [];
  const base = baseLocal(local);
  const hasPlus = local.includes("+");
  const plusTag = hasPlus ? local.slice(local.indexOf("+") + 1) : "";
  const dots = (base.match(/\./g) || []).length;
  const segments = base.split(".");
  const name = (row.name ?? "").trim();

  // A: plus-tag alias farm
  if (hasPlus && plusTag.length >= 4 && /^[a-z0-9]+$/i.test(plusTag)) {
    reasons.push("plus-tag");
  }

  // B: fragmented dots (letter soup)
  if (dots >= 3) {
    const shortSegs = segments.filter((s) => s.length <= 3).length;
    if (shortSegs >= 3 || segments.length >= 4) {
      reasons.push("fragmented-dots");
    }
  }
  // 2+ dots with many single-char segments
  if (segments.filter((s) => s.length === 1).length >= 3) {
    reasons.push("single-char-segments");
  }

  // C: gaming handle names used by the known farm wave
  if (
    /^(Ghost|Wolf|Bear|Blade|Reaper|Delta|Steel|Alpha|Tiger|Dante|Lunar|Viper|Falcon|Atlas|Phoenix|Storm|Lion|Solar|Night)\d{1,3}$/i.test(
      name,
    )
  ) {
    reasons.push("gaming-handle-name");
  }

  // D: user_N empty-ish farm names with alias local
  if (reasons.length > 0 && (!name || name === "" || /^user[_-]?\w*$/i.test(name))) {
    reasons.push("empty-or-userN-name");
  }

  // E: keyword bots
  if (/discord\.?bot|testbum|spam|fakebot|^bot\d{3,}/i.test(local)) {
    reasons.push("keyword-bot");
  }

  // Require at least one strong structural signal for auto-delete.
  // Gaming-handle alone is not enough (could collide).
  const structural = reasons.some((r) =>
    ["plus-tag", "fragmented-dots", "single-char-segments", "keyword-bot"].includes(r),
  );

  // Also: alias-like local AND (plus OR fragmented) already covered.
  // Extra: isAliasLikeLocalPart with plus or dots>=3
  if (!structural && isAliasLikeLocalPart(local) && (hasPlus || dots >= 3)) {
    reasons.push("alias-like");
  }

  const hit = reasons.some((r) =>
    ["plus-tag", "fragmented-dots", "single-char-segments", "keyword-bot", "alias-like"].includes(
      r,
    ),
  );

  return { hit, reasons: [...new Set(reasons)] };
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
      AND (email ILIKE '%@gmail.com' OR email ILIKE '%@googlemail.com')
    ORDER BY created_at DESC
  `) as UserRow[];

  const spamHits = rows
    .map((row) => {
      const { hit, reasons } = isGmailFarm(row);
      return hit ? { row, reasons } : null;
    })
    .filter((x): x is { row: UserRow; reasons: string[] } => x !== null);

  const paid = (await sql`
    SELECT user_id, plan_id, status
    FROM billing
    WHERE organization_id IS NULL
      AND plan_id IS NOT NULL
      AND status IN ('active', 'trialing', 'past_due', 'paid')
  `) as { user_id: string; plan_id: string; status: string }[];
  const paidByUser = new Map(paid.map((r) => [r.user_id, r]));

  const targets: typeof spamHits = [];
  const skippedPaid: Array<{ row: UserRow; plan_id: string; status: string; reasons: string[] }> =
    [];

  for (const hit of spamHits) {
    const plan = paidByUser.get(hit.row.id);
    if (plan) {
      skippedPaid.push({
        row: hit.row,
        plan_id: plan.plan_id,
        status: plan.status,
        reasons: hit.reasons,
      });
      continue;
    }
    targets.push(hit);
  }

  console.log(`Gmail/Googlemail users scanned: ${rows.length}`);
  console.log(`Farm pattern matches: ${spamHits.length}`);
  console.log(`Skipped (active paid plan): ${skippedPaid.length}`);
  console.log(`Delete targets: ${targets.length}`);

  if (skippedPaid.length > 0) {
    console.log("\nSkipped paid:");
    for (const s of skippedPaid) {
      console.log(
        `  ${s.row.email}  plan=${s.plan_id} status=${s.status}  [${s.reasons.join(",")}]`,
      );
    }
  }

  const byReason = new Map<string, number>();
  for (const t of targets) {
    for (const r of t.reasons) byReason.set(r, (byReason.get(r) ?? 0) + 1);
  }
  console.log("\nReasons:");
  for (const [r, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(4)}  ${r}`);
  }

  console.log("\nTargets:");
  for (const t of targets) {
    const created =
      t.row.created_at instanceof Date ? t.row.created_at.toISOString() : String(t.row.created_at);
    console.log(
      `  ${created} | ${t.row.email_verified ? "V" : "U"} | [${t.reasons.join(",")}] | ${t.row.email} | ${JSON.stringify(t.row.name)} | ${t.row.id}`,
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

  const ids = targets.map((t) => t.row.id);
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

  console.log(`\nDeleted ${deleted} spam Gmail user rows (cascades applied).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
