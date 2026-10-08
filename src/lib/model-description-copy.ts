import { useExtracted } from "next-intl";

type ModelDescriptionSource = {
  description?: string;
  source?: string;
};

export function useModelDescriptionCopy() {
  const t = useExtracted();

  return {
    "OpenAI flagship for complex reasoning, coding, and agentic work.": t(
      "OpenAI flagship for complex reasoning, coding, and agentic work.",
    ),
    "High-end GPT-6 model for demanding reasoning, coding, and agentic work.": t(
      "High-end GPT-6 model for demanding reasoning, coding, and agentic work.",
    ),
    "High-end GPT-6.1 model for demanding reasoning, coding, and agentic work.": t(
      "High-end GPT-6.1 model for demanding reasoning, coding, and agentic work.",
    ),
    "Fast, cost-efficient GPT-6 model for high-volume tasks.": t(
      "Fast, cost-efficient GPT-6 model for high-volume tasks.",
    ),
    "Balanced GPT-5.6 model for everyday work at half the cost of Sol.": t(
      "Balanced GPT-5.6 model for everyday work at half the cost of Sol.",
    ),
    "Fastest, most affordable GPT-5.6 model for high-volume tasks.": t(
      "Fastest, most affordable GPT-5.6 model for high-volume tasks.",
    ),
    "A new class of intelligence for coding and professional work.": t(
      "A new class of intelligence for coding and professional work.",
    ),
    "A more affordable model for coding and professional work.": t(
      "A more affordable model for coding and professional work.",
    ),
    "Our strongest mini model yet for coding, computer use, and subagents.": t(
      "Our strongest mini model yet for coding, computer use, and subagents.",
    ),
    "Our cheapest GPT-5.4-class model for simple high-volume tasks.": t(
      "Our cheapest GPT-5.4-class model for simple high-volume tasks.",
    ),
    "General purpose OpenAI model": t("General purpose OpenAI model"),
    "The most capable agentic coding model to date.": t(
      "The most capable agentic coding model to date.",
    ),
    "For complex coding tasks": t("For complex coding tasks"),
    "A version of GPT-5.1-Codex optimized for long-running tasks.": t(
      "A version of GPT-5.1-Codex optimized for long-running tasks.",
    ),
    "For quick coding tasks": t("For quick coding tasks"),
    "Flagship model for coding, reasoning, and agentic tasks across domains.": t(
      "Flagship model for coding, reasoning, and agentic tasks across domains.",
    ),
    "Faster, more affordable GPT-5 for well-defined tasks.": t(
      "Faster, more affordable GPT-5 for well-defined tasks.",
    ),
    "Fastest, most cost-efficient GPT-5 model.": t("Fastest, most cost-efficient GPT-5 model."),
    "Smartest model for fast, everyday tasks.": t("Smartest model for fast, everyday tasks."),
    "Fast, intelligent, flexible GPT model.": t("Fast, intelligent, flexible GPT model."),
    "Fast, affordable small model for focused tasks.": t(
      "Fast, affordable small model for focused tasks.",
    ),
    "Most powerful open-weight model": t("Most powerful open-weight model"),
    "Medium-sized open-weight model": t("Medium-sized open-weight model"),
    "Best for complex tasks": t("Best for complex tasks"),
    "Best for coding and agentic tasks": t("Best for coding and agentic tasks"),
    "Best for everyday tasks": t("Best for everyday tasks"),
    "Best for high volume tasks": t("Best for high volume tasks"),
    "Anthropic's flagship for agentic coding, computer use, and knowledge work.": t(
      "Anthropic's flagship for agentic coding, computer use, and knowledge work.",
    ),
    "Successor to Claude Fable 5 for long-running agentic coding, knowledge work, and research.": t(
      "Successor to Claude Fable 5 for long-running agentic coding, knowledge work, and research.",
    ),
    "Anthropic's most capable model for long-horizon agentic work.": t(
      "Anthropic's most capable model for long-horizon agentic work.",
    ),
    "For complex agentic coding and enterprise work.": t(
      "For complex agentic coding and enterprise work.",
    ),
    "Fast, balanced model for coding, agents, and everyday knowledge work.": t(
      "Fast, balanced model for coding, agents, and everyday knowledge work.",
    ),
    "Balanced Claude 5 model for coding, writing, and everyday agentic work.": t(
      "Balanced Claude 5 model for coding, writing, and everyday agentic work.",
    ),
    "All-around professional model": t("All-around professional model"),
    "Legacy All-around professional model": t("Legacy All-around professional model"),
    "Hybrid reasoning model": t("Hybrid reasoning model"),
    "Fast, lightweight Claude model for everyday chat and quick reasoning.": t(
      "Fast, lightweight Claude model for everyday chat and quick reasoning.",
    ),
    "Fast, lightweight Claude 5 model for everyday chat and quick reasoning.": t(
      "Fast, lightweight Claude 5 model for everyday chat and quick reasoning.",
    ),
    "Legacy professional model": t("Legacy professional model"),
    "Beta Grok model for deep research with coordinated multi-agent tool use.": t(
      "Beta Grok model for deep research with coordinated multi-agent tool use.",
    ),
    "Reasoning-enabled Grok 4.20 variant for agentic tool calling and harder tasks.": t(
      "Reasoning-enabled Grok 4.20 variant for agentic tool calling and harder tasks.",
    ),
    "Non-reasoning Grok 4.20 variant tuned for fast responses and tool use.": t(
      "Non-reasoning Grok 4.20 variant tuned for fast responses and tool use.",
    ),
    "Fast Grok model optimized for accurate tool calling, deep research, and low hallucination.": t(
      "Fast Grok model optimized for accurate tool calling, deep research, and low hallucination.",
    ),
    "Cost-efficient Grok model with strong reasoning, native tool use, and real-time search.": t(
      "Cost-efficient Grok model with strong reasoning, native tool use, and real-time search.",
    ),
    "Flagship Grok reasoning model with native tool use and real-time search.": t(
      "Flagship Grok reasoning model with native tool use and real-time search.",
    ),
    "DeepSeek V4 for reasoning, coding, and general agentic work.": t(
      "DeepSeek V4 for reasoning, coding, and general agentic work.",
    ),
    "Higher-capacity DeepSeek V4 for harder reasoning and coding tasks.": t(
      "Higher-capacity DeepSeek V4 for harder reasoning and coding tasks.",
    ),
    "MiniMax M3 for fast reasoning and everyday agentic tasks.": t(
      "MiniMax M3 for fast reasoning and everyday agentic tasks.",
    ),
  } as Record<string, string>;
}

export function translateModelDescription(
  model: ModelDescriptionSource,
  copy: Record<string, string>,
) {
  if (!model.description) {
    return undefined;
  }

  if (model.source === "custom") {
    return model.description;
  }

  return copy[model.description] ?? model.description;
}
