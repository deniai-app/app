import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { modelHealth } from "@/db/schema";
import { env } from "@/env";
import { models } from "@/lib/constants";
import { createDeniOpenRouter } from "@/lib/openrouter-provider";

const PROBE_TIMEOUT_MS = 30_000;
const MAX_ERROR_LENGTH = 300;

/** Catalog models probed by the scheduler: OpenAI models on the Deni AI API, others on OpenRouter. */
export const HEALTH_CHECK_MODEL_VALUES = [
  "gpt-6-luna",
  "gpt-5.6-luna",
  "gemini-3.8-flash",
  "claude-haiku-5.5",
] as const;

export type ModelHealthResult = {
  model: string;
  provider: string;
  available: boolean;
  latencyMs: number | null;
  error: string | null;
};

function getProbeProvider(value: string) {
  const definition = models.find((candidate) => candidate.value === value);
  if (!definition) throw new Error(`Unknown model: ${value}`);
  return {
    provider: definition.provider ?? definition.author,
    modelId: `${definition.author}/${definition.value}`,
  };
}

function createProbeModel(provider: string, modelId: string): LanguageModel {
  if (provider === "deni") {
    const apiKey = env.DENI_API_KEY?.trim();
    if (!apiKey) throw new Error("Deni AI API is not configured");
    return createOpenAI({ apiKey, baseURL: env.DENI_API_BASE_URL }).chat(modelId);
  }

  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenRouter is not configured");
  return createDeniOpenRouter({ apiKey }).chat(modelId, {
    provider: {
      allow_fallbacks: false,
      only: ["openai", "anthropic", "google-ai-studio"],
    },
  });
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

export async function probeModel(value: string): Promise<ModelHealthResult> {
  const startedAt = Date.now();
  let provider = "unknown";
  try {
    const probe = getProbeProvider(value);
    provider = probe.provider;
    await generateText({
      model: createProbeModel(probe.provider, probe.modelId),
      prompt: "ping",
      maxOutputTokens: 1,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return {
      model: value,
      provider,
      available: true,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      model: value,
      provider,
      available: false,
      latencyMs: Date.now() - startedAt,
      error: describeError(error),
    };
  }
}

export async function recordModelHealth(result: ModelHealthResult) {
  const now = new Date();
  await db
    .insert(modelHealth)
    .values({
      model: result.model,
      provider: result.provider,
      available: result.available,
      latencyMs: result.latencyMs,
      error: result.error,
      consecutiveFailures: result.available ? 0 : 1,
      checkedAt: now,
      lastAvailableAt: result.available ? now : null,
    })
    .onConflictDoUpdate({
      target: modelHealth.model,
      set: {
        provider: result.provider,
        available: result.available,
        latencyMs: result.latencyMs,
        error: result.error,
        consecutiveFailures: result.available ? 0 : sql`${modelHealth.consecutiveFailures} + 1`,
        checkedAt: now,
        ...(result.available ? { lastAvailableAt: now } : {}),
      },
    });
}

export async function checkModelHealth(): Promise<ModelHealthResult[]> {
  const results = await Promise.all(HEALTH_CHECK_MODEL_VALUES.map(probeModel));
  await Promise.all(results.map(recordModelHealth));
  return results;
}

export async function getModelHealth() {
  const rows = await db.select().from(modelHealth);
  const order = new Map<string, number>(HEALTH_CHECK_MODEL_VALUES.map((value, i) => [value, i]));
  return rows
    .filter((row) => order.has(row.model))
    .sort((a, b) => (order.get(a.model) ?? 0) - (order.get(b.model) ?? 0));
}
