/**
 * Fetches the latest disposable-email domain lists from the upstream repo and
 * writes the deduplicated, allowlist-filtered result to `data/domains.json`.
 *
 * Usage (from this package): pnpm run refresh
 * Usage (from repo root):    pnpm run disposable:refresh
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAW_BASE =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main";
const BLOCKLIST_URL = `${RAW_BASE}/disposable_email_blocklist.conf`;
// The upstream repo currently ships no allowlist; this stays best-effort so the
// refresh keeps working if/when an allowlist is (re)added. A 404 means "empty".
const ALLOWLIST_URL = `${RAW_BASE}/allowlist.conf`;

function parseList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

async function fetchList(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return parseList(await res.text());
}

async function fetchOptionalList(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (res.status === 404) {
    console.warn(`Allowlist not found at ${url} (404) — continuing with none.`);
    return [];
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return parseList(await res.text());
}

/**
 * Reads the locally-maintained custom domain list. These are domains added by
 * hand that aren't (yet) in the upstream blocklist. Missing file => empty list.
 */
async function readCustomList(path: string): Promise<string[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`Custom domain list not found at ${path} — continuing with none.`);
      return [];
    }
    throw error;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array of domains in ${path}`);
  }
  return parsed
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

async function main(): Promise<void> {
  console.log("Fetching disposable email domain lists...");
  const [blocklist, allowlist] = await Promise.all([
    fetchList(BLOCKLIST_URL),
    fetchOptionalList(ALLOWLIST_URL),
  ]);

  const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
  const customPath = join(dataDir, "custom-domains.json");

  const allow = new Set(allowlist);
  const upstream = [...new Set(blocklist)].filter((domain) => !allow.has(domain));
  const upstreamSet = new Set(upstream);

  // Custom domains that upstream already covers are redundant — drop them from
  // the custom list so it only ever holds domains upstream is still missing.
  const customAll = await readCustomList(customPath);
  const keptCustom = [...new Set(customAll)]
    .filter((domain) => !allow.has(domain) && !upstreamSet.has(domain))
    .sort();
  const prunedCount = new Set(customAll).size - keptCustom.length;

  await mkdir(dataDir, { recursive: true });
  await writeFile(customPath, `${JSON.stringify(keptCustom, null, 2)}\n`);

  const domains = [...new Set([...upstream, ...keptCustom])].sort();
  await writeFile(join(dataDir, "domains.json"), `${JSON.stringify(domains)}\n`);

  console.log(
    `Wrote ${domains.length} domains (blocklist ${blocklist.length}, allowlist ${allowlist.length}, ` +
      `custom ${keptCustom.length}${prunedCount > 0 ? `, pruned ${prunedCount} now-upstream custom` : ""}) ` +
      `to data/domains.json`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
