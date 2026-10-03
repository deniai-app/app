type BuildSystemPromptParams = {
  currentDate: string;
  persistentMemory: string | null;
  projectPrompt: string | null;
  additionalInstruction?: string;
  responseStyle?: "retry" | "detailed" | "concise";
  webSearchEnabled?: boolean;
  searchToolEnabled?: boolean;
  browseToolEnabled?: boolean;
  interactive?: boolean;
  deepResearch?: boolean;
  forceWebSearch?: boolean;
};

export function buildChatSystemPrompt({
  currentDate,
  persistentMemory,
  projectPrompt,
  additionalInstruction,
  responseStyle,
  webSearchEnabled = false,
  searchToolEnabled = webSearchEnabled,
  browseToolEnabled = webSearchEnabled,
  interactive = true,
  deepResearch = false,
  forceWebSearch = false,
}: BuildSystemPromptParams): string {
  const responseStyleInstruction =
    responseStyle === "detailed"
      ? "The user asked to regenerate the previous answer with more detail. Keep the same intent, but expand the explanation, include more useful specifics, and improve completeness."
      : responseStyle === "concise"
        ? "The user asked to regenerate the previous answer more concisely. Keep the same intent, but shorten the response, reduce repetition, and prioritize the most important points."
        : responseStyle === "retry"
          ? "The user asked for a fresh retry of the previous answer. Preserve the intent, but vary the phrasing and structure while keeping the response accurate and useful."
          : null;
  const forceWebSearchInstruction =
    forceWebSearch && searchToolEnabled
      ? "Web search is required for this response. Use the search tool at least once before answering, then cite the sources you used."
      : null;
  const researchInstruction =
    deepResearch && searchToolEnabled
      ? [
          "Deep research mode is enabled.",
          "Use the search tool multiple times when helpful.",
          ...(browseToolEnabled
            ? [
                "Use the browse tool to open important URLs and read their full page content when snippets are insufficient.",
              ]
            : []),
          "Cross-check claims before concluding.",
          "Return a structured report with: Summary, Key Findings, Risks or Unknowns, and Sources.",
        ].join(" ")
      : null;
  const additionalInstructionPrompt = additionalInstruction
    ? `Additional regeneration instruction from the user: ${additionalInstruction}`
    : null;
  const webSearchInstructions = [
    ...(searchToolEnabled
      ? [
          "- Use the search tool when you need current information, recent events, prices, news, documentation, or facts you are not confident about — even if the user did not explicitly ask to search.",
          "- Each search tool call consumes a fixed amount of the user's usage quota. Prefer one precise query over several overlapping ones, and skip search for casual conversation or questions you can answer confidently from general knowledge.",
        ]
      : []),
    ...(browseToolEnabled
      ? [
          "- Use the browse tool to open a specific URL and read its full page content (for example when the user shares a link, or when search snippets are not enough).",
        ]
      : []),
    ...(searchToolEnabled || browseToolEnabled
      ? ["- Always cite sources when using information from search or browse results."]
      : []),
  ];

  const defaultSystemPromptParts = [
    "You are a helpful AI assistant.",
    `Current date: ${currentDate}.`,
    persistentMemory,
    projectPrompt,
    "Guidelines:",
    "- Provide accurate, helpful, and concise responses.",
    interactive
      ? "- Use the `questionnaire` tool when several structured clarifications or selectable answers will help more than a prose question. Keep it short, mark genuinely optional questions optional, and continue using the user's answers after submission. A skipped answer is intentionally unanswered."
      : null,
    ...webSearchInstructions,
    searchToolEnabled
      ? "- If you're unsure about something that can be checked on the web, use the search tool rather than guessing. Otherwise acknowledge the uncertainty."
      : "- If you're unsure about something, acknowledge the uncertainty rather than making up information.",
    "- Format code blocks with appropriate syntax highlighting.",
    "- Use markdown formatting for better readability.",
    additionalInstructionPrompt,
    responseStyleInstruction,
    researchInstruction,
    forceWebSearchInstruction,
  ].filter((value): value is string => value != null);

  return defaultSystemPromptParts.join(" ");
}
