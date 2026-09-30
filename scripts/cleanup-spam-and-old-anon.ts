/**
 * Cleanup:
 *  1) High-confidence temp-mail spam wave:
 *     firstname.lastname###[.hex]@non-major-domain
 *  2) Old anonymous guest accounts (is_anonymous + temp@…), older than N days
 *
 * Usage:
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/cleanup-spam-and-old-anon.ts              # dry-run
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/cleanup-spam-and-old-anon.ts --apply      # delete
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/cleanup-spam-and-old-anon.ts --anon-days=7
 *
 * Cascades handle dependent rows. Stripe customers are NOT touched.
 */

import { neon } from "@neondatabase/serverless";

const MAJOR_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.jp",
  "hotmail.com",
  "outlook.com",
  "outlook.jp",
  "live.com",
  "live.jp",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
  "msn.com",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "qq.com",
  "163.com",
  "126.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "docomo.ne.jp",
  "ezweb.ne.jp",
  "softbank.ne.jp",
  "i.softbank.jp",
  "au.com",
  "yahoo.co.uk",
  "hotmail.co.jp",
  "wp.pl",
  "india.com",
  "tutamail.com",
  "googlemail.co.jp",
  "ymail.ne.jp",
  "gmx.de",
  "gmx.com",
  "gmx.net",
]);

/** firstname.lastname + 2–4 digits + optional .hex */
const NAME_HEX_RE = /^[a-z]+\.[a-z]+\d{2,4}(\.[a-f0-9]{6,12})?@/i;

type UserRow = {
  id: string;
  email: string;
  is_anonymous: boolean | null;
  email_verified: boolean;
  created_at: string | Date;
};

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

function isNameHexSpam(email: string): boolean {
  if (!email.includes("@")) return false;
  if (MAJOR_DOMAINS.has(domainOf(email))) return false;
  return NAME_HEX_RE.test(email);
}

function isAnonymousGuest(row: UserRow): boolean {
  if (!row.is_anonymous) return false;
  const email = (row.email || "").toLowerCase();
  // better-auth anonymous placeholders: temp@<random>.com
  return email.startsWith("temp@") || email.length === 0;
}

function parseAnonDays(argv: string[]): number {
  const flag = argv.find((a) => a.startsWith("--anon-days="));
  if (!flag) return 7;
  const n = Number(flag.split("=")[1]);
  if (!Number.isFinite(n) || n < 0) {
    console.error("Invalid --anon-days");
    process.exit(1);
  }
  return n;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const anonDays = parseAnonDays(process.argv);
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = neon(url);
  const rows = (await sql`
    SELECT id, email, is_anonymous, email_verified, created_at
    FROM "user"
    ORDER BY created_at DESC
  `) as UserRow[];

  const anonCutoff = Date.now() - anonDays * 24 * 60 * 60 * 1000;

  const spamBots = rows.filter((r) => isNameHexSpam(r.email || ""));
  const oldAnon = rows.filter((r) => {
    if (!isAnonymousGuest(r)) return false;
    return new Date(r.created_at).getTime() < anonCutoff;
  });

  // De-dupe (should not overlap, but be safe)
  const byId = new Map<string, { row: UserRow; reasons: string[] }>();
  for (const r of spamBots) {
    const entry = byId.get(r.id) ?? { row: r, reasons: [] };
    entry.reasons.push("nameHex-spam");
    byId.set(r.id, entry);
  }
  for (const r of oldAnon) {
    const entry = byId.get(r.id) ?? { row: r, reasons: [] };
    entry.reasons.push(`old-anon>${anonDays}d`);
    byId.set(r.id, entry);
  }

  const targets = [...byId.values()];
  console.log(`Scanned ${rows.length} users.`);
  console.log(`  nameHex spam bots: ${spamBots.length}`);
  console.log(`  old anonymous (older than ${anonDays}d): ${oldAnon.length}`);
  console.log(`  unique delete targets: ${targets.length}`);

  if (spamBots.length > 0) {
    console.log("\nSpam bots sample (up to 10):");
    for (const r of spamBots.slice(0, 10)) {
      console.log(`  ${r.id}  ${r.email}  created=${r.created_at}`);
    }
    const byDomain = new Map<string, number>();
    for (const r of spamBots) {
      const d = domainOf(r.email);
      byDomain.set(d, (byDomain.get(d) ?? 0) + 1);
    }
    console.log(`  unique spam domains: ${byDomain.size}`);
  }

  if (oldAnon.length > 0) {
    console.log("\nOld anonymous sample (up to 10):");
    for (const r of oldAnon.slice(0, 10)) {
      console.log(`  ${r.id}  ${r.email}  created=${r.created_at}`);
    }
    const newest = oldAnon[0];
    const oldest = oldAnon[oldAnon.length - 1];
    console.log(`  newest old-anon: ${newest?.created_at}`);
    console.log(`  oldest old-anon: ${oldest?.created_at}`);
  }

  // Recent anon kept (for visibility)
  const keptAnon = rows.filter((r) => {
    if (!isAnonymousGuest(r)) return false;
    return new Date(r.created_at).getTime() >= anonCutoff;
  });
  console.log(`\nAnonymous kept (last ${anonDays}d): ${keptAnon.length}`);

  if (targets.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to delete.");
    return;
  }

  const ids = targets.map((t) => t.row.id);
  const CHUNK = 200;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const result = (await sql`DELETE FROM "user" WHERE id = ANY(${slice}) RETURNING id`) as {
      id: string;
    }[];
    deleted += result.length;
    console.log(`  deleted chunk ${i / CHUNK + 1}: ${result.length}`);
  }

  console.log(`\nDeleted ${deleted} user rows (cascades applied).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
