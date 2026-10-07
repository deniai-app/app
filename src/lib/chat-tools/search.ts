import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { env } from "@/env";
import {
  consumeUsage,
  recordObservedUsage,
  getSearchToolUsageAmount,
  settleUsage,
  UsageLimitError,
} from "@/lib/usage";
import { fetchPageMarkdown, fetchPageText } from "./fetch-page";
import { fetchWithAbortHandling, isAbortError, withDeadline } from "./helpers";
import type { ChatToolUsageContext, SearchResult } from "./types";

const SEARCH_TOTAL_TIMEOUT_MS = 20_000;
const EXA_TIMEOUT_MS = 8_000;
const PAGE_FETCH_TIMEOUT_MS = 6_000;
const PAGE_CONTENT_MAX_PAGES = 3;
const PAGE_CONTENT_MAX_CHARS = 4_000;

type SearchHit = SearchResult & { content?: string };

type ExaSearchResponse = {
  results?: Array<{
    title: string;
    url: string;
    text?: string;
    highlights?: string[];
  }>;
};

type SearchCharge = { amount: number; reservationId: string };

async function chargeSearchUsage(usage: ChatToolUsageContext): Promise<SearchCharge> {
  const amount = getSearchToolUsageAmount(usage.isAnonymous);
  const reservationId = `search:${randomUUID()}`;
  await consumeUsage({
    userId: usage.userId,
    category: "basic",
    isAnonymous: usage.isAnonymous,
    amount,
    reservationId,
  });
  return { amount, reservationId };
}

async function settleSearchUsage(
  usage: ChatToolUsageContext,
  charge: SearchCharge,
  amount: number,
): Promise<void> {
  try {
    await recordObservedUsage({
      userId: usage.userId,
      reservationId: charge.reservationId,
      amount,
    });
    await settleUsage({ userId: usage.userId, reservationId: charge.reservationId, amount });
  } catch (error) {
    console.error("Search usage reservation retained for settlement", error);
  }
}

async function attachPageContent(result: SearchHit, signal: AbortSignal): Promise<SearchHit> {
  try {
    const pageOptions = {
      maxChars: PAGE_CONTENT_MAX_CHARS,
      timeoutMs: PAGE_FETCH_TIMEOUT_MS,
      signal,
    };
    const page = await fetchPageMarkdown(result.url, pageOptions).catch((error: unknown) => {
      if (isAbortError(error)) throw error;
      return fetchPageText(result.url, { ...pageOptions, allowReaderFallback: false });
    });

    return { ...result, content: page.content || result.description };
  } catch {
    return { ...result, content: result.description };
  }
}

export function createSearchTool(usage?: ChatToolUsageContext) {
  return tool({
    description:
      "Search the web and get page content for the top results. Use this whenever current, local, or easily-changed facts would improve the answer — news, prices, docs, people, products, or anything you are not confident about — even if the user did not ask you to search. Skip it for casual chat or questions you can answer confidently from general knowledge. Each call consumes a fixed amount of the user's usage quota, so prefer one well-chosen query over several overlapping ones. Prefer the browse tool when you need the full content of a specific URL.",
    inputSchema: z.object({
      query: z.string().min(1).describe("Search query"),
      amount: z
        .number()
        .int()
        .min(5)
        .max(15)
        .optional()
        .describe("Number of search pages (min 5, max 15)"),
    }),
    execute: async ({ query, amount }, { abortSignal }) => {
      const maxResults = Math.min(Math.max(amount ?? 10, 5), 15);
      let charge: SearchCharge | undefined;
      let results: SearchHit[] = [];

      try {
        const outcome = await withDeadline(SEARCH_TOTAL_TIMEOUT_MS, abortSignal, async (signal) => {
          if (usage) {
            charge = await chargeSearchUsage(usage);
          }

          const EXA_API_KEY = env.EXA_API_KEY;
          if (!EXA_API_KEY) {
            throw new Error("Exa API key not configured");
          }

          const response = await withDeadline(EXA_TIMEOUT_MS, signal, (exaSignal) =>
            fetchWithAbortHandling("https://api.exa.ai/search", {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "x-api-key": EXA_API_KEY,
              },
              body: JSON.stringify({
                query,
                numResults: maxResults,
                type: "fast",
                contents: {
                  highlights: {
                    query,
                    maxCharacters: 2000,
                  },
                },
              }),
              signal: exaSignal,
            }),
          );

          if (response.status === 429) {
            if (charge && charge.amount > 0 && usage) {
              await settleSearchUsage(usage, charge, 0);
              charge = undefined;
            }
            return [];
          }

          if (!response.ok) {
            throw new Error(`Exa Search API error: ${response.status}`);
          }

          const data = (await response.json()) as ExaSearchResponse;
          results = (data.results ?? []).map((item) => ({
            title: item.title,
            url: item.url,
            description: item.highlights?.join("\n\n") || item.text?.slice(0, 500) || "",
          }));

          if (results.length === 0 || signal.aborted) {
            return results.map((result) => ({ ...result, content: result.description }));
          }

          const withContent = await Promise.all(
            results
              .slice(0, PAGE_CONTENT_MAX_PAGES)
              .map((result) => attachPageContent(result, signal)),
          );

          return [
            ...withContent,
            ...results
              .slice(PAGE_CONTENT_MAX_PAGES)
              .map((result) => ({ ...result, content: result.description })),
          ];
        });
        if (charge && usage) await settleSearchUsage(usage, charge, charge.amount);
        return outcome;
      } catch (error) {
        if (results.length > 0) {
          if (charge && usage) await settleSearchUsage(usage, charge, charge.amount);
          return results.map((result) => ({ ...result, content: result.description }));
        }
        if (charge && charge.amount > 0 && usage) {
          await settleSearchUsage(usage, charge, 0);
        }
        if (error instanceof UsageLimitError) {
          throw new Error("Web search is unavailable because the usage limit was reached.");
        }
        if (isAbortError(error)) {
          throw new Error("Web search timed out. Please try again.");
        }
        console.error("Search tool error:", error);
        throw new Error("Web search failed. Please try again later.");
      }
    },
  });
}
