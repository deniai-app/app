import { createBrowseTool } from "./browse";
import { createQuestionnaireTool } from "./questionnaire";
import { createSearchTool } from "./search";
import { platformCapabilities } from "@/lib/platform-capabilities.server";
import type { CreateChatToolsOptions } from "./types";

export function createChatTools({ webSearch = true, usage }: CreateChatToolsOptions) {
  const { features } = platformCapabilities;
  const webSearchEnabled = webSearch && features.webSearch;

  return {
    questionnaire: createQuestionnaireTool(),
    ...(webSearchEnabled
      ? {
          search: createSearchTool(usage),
          browse: createBrowseTool(),
        }
      : {}),
  };
}
