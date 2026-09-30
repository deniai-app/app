import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const sourceDir = join(root, "src");
const shimPath = join(sourceDir, "lib/lucide-react.ts");
const barrelPath = join(root, "node_modules/lucide-react/dist/esm/lucide-react.mjs");

async function* sourceFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(path);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && path !== shimPath) {
      yield path;
    }
  }
}

async function importedIcons(): Promise<Map<string, string[]>> {
  const imports = new Map<string, string[]>();
  for await (const path of sourceFiles(sourceDir)) {
    const source = await readFile(path, "utf8");
    // Icon imports in this repo are static named imports. Ignore type-only imports.
    for (const match of source.matchAll(
      /^[ \t]*import\s+(?!type\b)\{([^}]+)\}\s+from\s+["']lucide-react["']/gm,
    )) {
      for (const specifier of match[1].split(",")) {
        const name = specifier.trim().match(/^(?!type\b)(\w+)(?:\s+as\s+\w+)?$/)?.[1];
        if (!name) continue;
        const files = imports.get(name) ?? [];
        files.push(relative(root, path));
        imports.set(name, files);
      }
    }
  }
  return imports;
}

async function main() {
  const [shim, barrel, imports] = await Promise.all([
    readFile(shimPath, "utf8"),
    readFile(barrelPath, "utf8"),
    importedIcons(),
  ]);
  const known = new Set(
    Array.from(shim.matchAll(/^export \{ default as (\w+) \} from /gm), (match) => match[1]),
  );
  const exports = new Map<string, string>();
  for (const match of barrel.matchAll(/^export \{ ([^}]+) \} from '\.\/icons\/([^']+\.mjs)';/gm)) {
    const [, names, file] = match;
    for (const name of names.matchAll(/default as (\w+)/g)) exports.set(name[1], file);
  }

  const additions: string[] = [];
  for (const [name, files] of [...imports].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    if (known.has(name)) continue;
    const file = exports.get(name);
    if (!file) {
      throw new Error(`No lucide-react icon export for ${name} (used in ${files.join(", ")})`);
    }
    additions.push(`export { default as ${name} } from "lucide-react/dist/esm/icons/${file}";`);
  }
  if (additions.length === 0) {
    console.log("Lucide type exports are up to date.");
    return;
  }
  // Keep existing aliases intact; only insert newly used names into the sorted export list.
  const lines = shim.split("\n");
  for (const addition of additions) {
    const name = addition.match(/default as (\w+)/)?.[1] ?? "";
    const index = lines.findIndex((line) => {
      const existing = line.match(/^export \{ default as (\w+) \}/)?.[1];
      return existing !== undefined && existing.localeCompare(name, "en") > 0;
    });
    lines.splice(index < 0 ? lines.length - 1 : index, 0, addition);
  }
  await writeFile(shimPath, lines.join("\n"));
  console.log(
    `Added ${additions.length} Lucide type export(s): ${additions.map((line) => line.match(/default as (\w+)/)?.[1]).join(", ")}`,
  );
}

await main();
