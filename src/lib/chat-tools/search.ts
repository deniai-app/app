import { createGroq } from "@ai-sdk/groq";
import { generateText, tool } from "ai";
import { z } from "zod";
import { env } from "@/env";
import { consumeUsage, getSearchToolUsageAmount, refundUsage, UsageLimitError } from "@/lib/usage";
import { fetchPageText } from "./fetch-page";
import { fetchWithAbortHandling, isAbortError, withDeadline } from "./helpers";
import type { ChatToolUsageContext, SearchResult } from "./types";

const SEARCH_TOTAL_TIMEOUT_MS = 20_000;
const EXA_TIMEOUT_MS = 8_000;
const PAGE_FETCH_TIMEOUT_MS = 6_000;
const SUMMARIZE_TIMEOUT_MS = 8_000;
const SUMMARIZE_MAX_PAGES = 3;

type SearchHit = SearchResult & { summary?: string };

type ExaSearchResponse = {
  results?: Array<{
    title: string;
    url: string;
    text?: string;
    highlights?: string[];
  }>;
};

async function chargeSearchUsage(usage: ChatToolUsageContext): Promise<number> {
  const amount = getSearchToolUsageAmount(usage.isAnonymous);
  const consumed = await consumeUsage({
    userId: usage.userId,
    category: "basic",
    isAnonymous: usage.isAnonymous,
    amount,
  });

  if (consumed.limit === null) {
    return 0;
  }

  usage.onCharged?.({ amount, maxModeAmount: consumed.maxModeAmount });
  return amount;
}

async function refundSearchUsage(usage: ChatToolUsageContext, amount: number): Promise<void> {
  try {
    const refunded = await refundUsage({
      userId: usage.userId,
      category: "basic",
      amount,
      isAnonymous: usage.isAnonymous,
    });
    usage.onRefunded?.({ amount, maxModeRefunded: refunded.maxModeRefunded });
  } catch (error) {
    console.error("Failed to refund search tool usage", error);
  }
}

async function summarizeResult(
  result: SearchHit,
  summarizer: ReturnType<ReturnType<typeof createGroq>>,
  signal: AbortSignal,
): Promise<SearchHit> {
  try {
    const page = await fetchPageText(result.url, {
      maxChars: 4_000,
      timeoutMs: PAGE_FETCH_TIMEOUT_MS,
      signal,
      allowReaderFallback: false,
    });

    if (!page.content) {
      return { ...result, summary: result.description };
    }

    const { text: summary } = await withDeadline(SUMMARIZE_TIMEOUT_MS, signal, (summarySignal) =>
      generateText({
        model: summarizer,
        prompt: `Summarize the following webpage content in a short paragraph:\n\n${page.content}`,
        maxOutputTokens: 400,
        maxRetries: 0,
        abortSignal: summarySignal,
      }),
    );

    return { ...result, summary: summary.trim() || result.description };
  } catch {
    return { ...result, summary: result.description };
  }
}

export function createSearchTool(usage?: ChatToolUsageContext) {
  return tool({
    description:
      "Search the web and get short page summaries. Use this whenever current, local, or easily-changed facts would improve the answer — news, prices, docs, people, products, or anything you are not confident about — even if the user did not ask you to search. Skip it for casual chat or questions you can answer confidently from general knowledge. Each call consumes a fixed amount of the user's usage quota, so prefer one well-chosen query over several overlapping ones. Prefer the browse tool when you need the full content of a specific URL.",
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
      let chargedAmount = 0;
      let results: SearchHit[] = [];

      try {
        return await withDeadline(SEARCH_TOTAL_TIMEOUT_MS, abortSignal, async (signal) => {
          if (usage) {
            chargedAmount = await chargeSearchUsage(usage);
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
            if (chargedAmount > 0 && usage) {
              await refundSearchUsage(usage, chargedAmount);
              chargedAmount = 0;
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

          const groqApiKey = env.GROQ_API_KEY?.trim();
          if (!groqApiKey || results.length === 0 || signal.aborted) {
            return results.map((result) => ({ ...result, summary: result.description }));
          }

          const summarizer = createGroq({ apiKey: groqApiKey })("openai/gpt-oss-20b");
          const toSummarize = results.slice(0, SUMMARIZE_MAX_PAGES);
          const remainder = results.slice(SUMMARIZE_MAX_PAGES);
          const summarizedHead = await Promise.all(
            toSummarize.map((result) => summarizeResult(result, summarizer, signal)),
          );

          return [
            ...summarizedHead,
            ...remainder.map((result) => ({ ...result, summary: result.description })),
          ];
        });
      } catch (error) {
        if (results.length > 0) {
          return results.map((result) => ({ ...result, summary: result.description }));
        }
        if (chargedAmount > 0 && usage) {
          await refundSearchUsage(usage, chargedAmount);
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
