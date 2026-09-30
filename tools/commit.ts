import { spawnSync } from "node:child_process";
import { generateObject } from "ai";
import { createDeniOpenRouter } from "../src/lib/openrouter-provider";
import { z } from "zod";

const DEFAULT_MODEL = "openai/gpt-5.6-luna";
const DEFAULT_MAX_DIFF_CHARS = 20_000_000;

type Options = {
  commit: boolean;
  stageAll: boolean;
  noVerify: boolean;
  repoPath: string;
  model: string;
  prompt?: string;
  description?: string;
  generateDescription: boolean;
  maxDiffChars: number;
};

type GeneratedCommit = {
  subject: string;
  body?: string;
};

function createCommitSchema(includeDescription: boolean) {
  return z.object({
    subject: z.string(),
    body: includeDescription ? z.string().nullable() : z.null(),
  });
}

function printHelp() {
  console.log(`Commit tool

Usage:
  pnpm run tools:commit [options]

Options:
  --it                 Alias for --all --generate-description --commit
  --check              Alias for --all --generate-description
  --commit             Create the git commit after generating the message
  --all                Stage all changes before generating the message
  --no-verify          Pass --no-verify to git commit
  --model <id>         OpenRouter model to use (default: ${DEFAULT_MODEL})
  --prompt <text>      Extra context for the generated commit message
  --description <text> Use this commit body instead of generating one
  --generate-description
                       Generate a short commit body in addition to the subject
  --repo <path>        Repository path (default: current working directory)
  --max-diff-chars <n> Truncate the staged diff sent to OpenRouter
  --help               Show this help

Examples:
  pnpm run tools:commit --it
  pnpm run tools:commit --check
  pnpm run tools:commit --all
  pnpm run tools:commit --all --commit
  pnpm run tools:commit --all --generate-description --commit
  pnpm run tools:commit --prompt "Focus on billing checkout changes"
`);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    commit: false,
    stageAll: false,
    noVerify: false,
    repoPath: process.cwd(),
    model: DEFAULT_MODEL,
    generateDescription: false,
    maxDiffChars: DEFAULT_MAX_DIFF_CHARS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--it":
        options.stageAll = true;
        options.generateDescription = true;
        options.commit = true;
        break;
      case "--check":
        options.stageAll = true;
        options.generateDescription = true;
        break;
      case "--commit":
        options.commit = true;
        break;
      case "--all":
        options.stageAll = true;
        break;
      case "--no-verify":
        options.noVerify = true;
        break;
      case "--model": {
        const nextValue = argv[index + 1];
        if (!nextValue) {
          throw new Error("--model requires a value");
        }
        options.model = nextValue;
        index += 1;
        break;
      }
      case "--prompt": {
        const nextValue = argv[index + 1];
        if (!nextValue) {
          throw new Error("--prompt requires a value");
        }
        options.prompt = nextValue;
        index += 1;
        break;
      }
      case "--description": {
        const nextValue = argv[index + 1];
        if (!nextValue) {
          throw new Error("--description requires a value");
        }
        options.description = nextValue;
        index += 1;
        break;
      }
      case "--generate-description":
        options.generateDescription = true;
        break;
      case "--repo": {
        const nextValue = argv[index + 1];
        if (!nextValue) {
          throw new Error("--repo requires a value");
        }
        options.repoPath = nextValue;
        index += 1;
        break;
      }
      case "--max-diff-chars": {
        const nextValue = argv[index + 1];
        if (!nextValue) {
          throw new Error("--max-diff-chars requires a value");
        }
        const parsed = Number.parseInt(nextValue, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error("--max-diff-chars must be a positive integer");
        }
        options.maxDiffChars = parsed;
        index += 1;
        break;
      }
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

// Node's default spawnSync maxBuffer is 1 MiB; large staged diffs (icons,
// lockfiles, bulk refactors) exceed that and surface as a bare command failure.
const GIT_MAX_BUFFER_BYTES = Math.max(DEFAULT_MAX_DIFF_CHARS * 2, 50 * 1024 * 1024);

function runGit(repoPath: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });

  const stdout = (result.stdout ?? "").trimEnd();
  const stderr = (result.stderr ?? "").trimEnd();

  if (result.error) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.error.message}${stderr ? `\n${stderr}` : ""}`,
    );
  }

  if (result.status !== 0) {
    throw new Error(stderr || `git ${args.join(" ")} failed (exit ${String(result.status)})`);
  }

  return stdout;
}

function tryRunGit(repoPath: string, args: string[]) {
  try {
    return runGit(repoPath, args);
  } catch {
    return "";
  }
}

function isSensitivePath(filePath: string) {
  return (
    (/(^|\/)\.env($|\..+)$/u.test(filePath) && !/(^|\/)\.env\.example$/u.test(filePath)) ||
    /(^|\/).*\.pem$/u.test(filePath) ||
    /(^|\/).*\.key$/u.test(filePath) ||
    /(^|\/)id_(rsa|ed25519)$/u.test(filePath)
  );
}

function extractPathsFromStatus(statusOutput: string) {
  return statusOutput
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((line) => {
      const renamedParts = line.split(" -> ");
      return renamedParts[renamedParts.length - 1] ?? line;
    });
}

function buildPrompt(input: {
  recentCommits: string;
  stagedFiles: string;
  diffStat: string;
  diffPatch: string;
  extraPrompt?: string;
}) {
  const sections = [
    "Recent commit style:",
    input.recentCommits || "(no recent commits found)",
    "",
    "Staged files:",
    input.stagedFiles,
    "",
    "Diff stat:",
    input.diffStat || "(no diff stat)",
    "",
    "Staged diff:",
    input.diffPatch || "(empty diff)",
  ];

  if (input.extraPrompt) {
    sections.push("", "Extra context:", input.extraPrompt);
  }

  return sections.join("\n");
}

function sanitizeCommitMessage(raw: string) {
  const firstLine = raw
    .trim()
    .replace(/^```[\w-]*\s*/u, "")
    .replace(/```$/u, "")
    .split("\n")[0]
    ?.trim()
    .replace(/^["'`]+|["'`]+$/gu, "");

  if (!firstLine) {
    throw new Error("OpenRouter returned an empty commit message");
  }

  return firstLine.slice(0, 72);
}

function sanitizeCommitBody(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```[\w-]*\s*/u, "")
    .replace(/```$/u, "")
    .replace(/\r\n/gu, "\n");

  if (!cleaned) {
    return undefined;
  }

  return cleaned
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .slice(0, 280);
}

function fallbackCommit(input: {
  stagedFiles: string;
  includeDescription: boolean;
}): GeneratedCommit {
  const fileCount = input.stagedFiles.split("\n").filter(Boolean).length;
  if (fileCount <= 1) {
    return {
      subject: "chore: update staged file",
      body: input.includeDescription ? "Update one staged file." : undefined,
    };
  }

  return {
    subject: "chore: update staged files",
    body: input.includeDescription ? `Update ${fileCount} staged files.` : undefined,
  };
}

async function generateCommit(input: {
  apiKey: string;
  model: string;
  prompt: string;
  includeDescription: boolean;
}) {
  const openrouter = createDeniOpenRouter({
    apiKey: input.apiKey,
  });

  const { object } = await generateObject({
    model: openrouter(input.model),
    schema: createCommitSchema(input.includeDescription),
    system: `You write concise conventional commit messages. Return JSON with a "subject" field${input.includeDescription ? ' and an optional "body" field' : ""}. The subject must be under 72 characters, use imperative mood, and use a suitable type like feat, fix, refactor, chore, docs, test, perf, build, ci, or style. ${input.includeDescription ? "If body is requested, keep it brief, plain text, and at most 3 short lines." : "Do not include a body unless it is requested."}`,
    prompt: input.prompt,
  });

  return {
    subject: sanitizeCommitMessage(object.subject),
    body: sanitizeCommitBody(object.body ?? ""),
  } satisfies GeneratedCommit;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const repoRoot = runGit(options.repoPath, ["rev-parse", "--show-toplevel"]);

  const statusBeforeStaging = runGit(repoRoot, ["status", "--short"]);
  if (options.stageAll) {
    const sensitiveCandidates = extractPathsFromStatus(statusBeforeStaging).filter(isSensitivePath);
    if (sensitiveCandidates.length > 0) {
      throw new Error(`Refusing to stage sensitive files: ${sensitiveCandidates.join(", ")}`);
    }
    runGit(repoRoot, ["add", "-A"]);
  }

  const stagedFiles = runGit(repoRoot, ["diff", "--cached", "--name-only"]);
  if (!stagedFiles) {
    throw new Error("No staged changes found. Stage files first or use --all.");
  }

  const sensitiveFiles = stagedFiles
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter(isSensitivePath);

  if (sensitiveFiles.length > 0) {
    throw new Error(`Refusing to commit sensitive files: ${sensitiveFiles.join(", ")}`);
  }

  const diffPatch = runGit(repoRoot, ["diff", "--cached", "--unified=2", "--no-ext-diff"]).slice(
    0,
    options.maxDiffChars,
  );

  const prompt = buildPrompt({
    recentCommits: tryRunGit(repoRoot, ["log", "--oneline", "-8"]),
    stagedFiles,
    diffStat: runGit(repoRoot, ["diff", "--cached", "--stat"]),
    diffPatch,
    extraPrompt: options.prompt,
  });

  let generatedCommit: GeneratedCommit;

  try {
    generatedCommit = await generateCommit({
      apiKey,
      model: options.model,
      prompt,
      includeDescription: options.generateDescription || Boolean(options.description),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`OpenRouter generation failed, using fallback. ${message}`);
    generatedCommit = fallbackCommit({
      stagedFiles,
      includeDescription: options.generateDescription || Boolean(options.description),
    });
  }

  const commitDescription = sanitizeCommitBody(options.description ?? generatedCommit.body ?? "");

  console.log(`Commit message: ${generatedCommit.subject}`);
  if (commitDescription) {
    console.log("Commit description:");
    console.log(commitDescription);
  }

  if (!options.commit) {
    console.log("Dry run only. Re-run with --commit to create the git commit.");
    return;
  }

  const commitArgs = ["commit", "-m", generatedCommit.subject];
  if (commitDescription) {
    commitArgs.push("-m", commitDescription);
  }
  if (options.noVerify) {
    commitArgs.push("--no-verify");
  }

  const commitOutput = runGit(repoRoot, commitArgs);
  console.log(commitOutput);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
