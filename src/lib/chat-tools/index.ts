import { createBrowseTool } from "./browse";
import { createQuestionnaireTool } from "./questionnaire";
import { createSearchTool } from "./search";
import { platformCapabilities } from "@/lib/platform-capabilities.server";
import type { CreateChatToolsOptions } from "./types";

export function createChatTools({
  webSearch = true,
  interactive = true,
  enabledTools = ["search", "browse"],
  usage,
}: CreateChatToolsOptions) {
  const { features } = platformCapabilities;
  const webSearchEnabled = webSearch && features.webSearch;

  return {
    ...(interactive ? { questionnaire: createQuestionnaireTool() } : {}),
    ...(webSearchEnabled && enabledTools.includes("search")
      ? { search: createSearchTool(usage) }
      : {}),
    ...(webSearchEnabled && enabledTools.includes("browse") ? { browse: createBrowseTool() } : {}),
  };
}
