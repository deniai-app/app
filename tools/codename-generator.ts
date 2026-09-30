import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODENAMES_FILE = join(__dirname, "codenames.json");

const ADJECTIVES = [
  "swift",
  "silent",
  "crimson",
  "shadow",
  "golden",
  "frozen",
  "blazing",
  "phantom",
  "stellar",
  "cosmic",
  "mystic",
  "thunder",
  "iron",
  "crystal",
  "emerald",
  "neon",
  "velvet",
  "silver",
  "sapphire",
  "amber",
  "obsidian",
  "lunar",
  "solar",
  "arctic",
  "electric",
];

const NOUNS = [
  "falcon",
  "wolf",
  "phoenix",
  "dragon",
  "serpent",
  "hawk",
  "panther",
  "tiger",
  "raven",
  "viper",
  "eagle",
  "storm",
  "blade",
  "arrow",
  "shield",
  "knight",
  "hunter",
  "specter",
  "wraith",
  "sphinx",
  "hydra",
  "titan",
  "oracle",
  "cipher",
  "sentinel",
];

interface CodenameStore {
  used: string[];
}

function loadStore(): CodenameStore {
  if (existsSync(CODENAMES_FILE)) {
    const content = readFileSync(CODENAMES_FILE, "utf-8");
    return JSON.parse(content) as CodenameStore;
  }
  return { used: [] };
}

function saveStore(store: CodenameStore): void {
  writeFileSync(CODENAMES_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateCodename(): string {
  const _adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const _noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  if (!_adjective || !_noun) {
    throw new Error("Failed to select adjective or noun");
  }
  const adjective = _adjective.charAt(0).toUpperCase() + _adjective.slice(1);
  const noun = _noun.charAt(0).toUpperCase() + _noun.slice(1);
  return `${adjective} ${noun}`;
}

export function getUniqueCodename(): string {
  const store = loadStore();
  const maxAttempts = ADJECTIVES.length * NOUNS.length;

  for (let i = 0; i < maxAttempts; i++) {
    const codename = generateCodename();
    if (!store.used.includes(codename)) {
      store.used.push(codename);
      saveStore(store);
      return codename;
    }
  }

  throw new Error("All codenames have been used. Reset the store or add more words.");
}

export function resetCodenames(): void {
  saveStore({ used: [] });
}

export function listUsedCodenames(): string[] {
  return loadStore().used;
}

export function getRemainingCount(): number {
  const store = loadStore();
  const totalPossible = ADJECTIVES.length * NOUNS.length;
  return totalPossible - store.used.length;
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("codename-generator.ts") ||
    process.argv[1].endsWith("codename-generator.js"));

if (isMain) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "generate":
      console.log(getUniqueCodename());
      break;
    case "list":
      console.log("Used codenames:", listUsedCodenames());
      break;
    case "reset":
      resetCodenames();
      console.log("Codenames reset.");
      break;
    case "remaining":
      console.log(`Remaining codenames: ${getRemainingCount()}`);
      break;
    default:
      console.log("Usage: pnpm run tools:codename <command>");
      console.log("Commands: generate, list, reset, remaining");
  }
}
