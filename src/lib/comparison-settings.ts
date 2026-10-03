import { z } from "zod";
import {
  reasoningEffortValues,
  resolveReasoningEffort,
  type ModelDefinition,
} from "@/lib/constants";

export const comparisonToolNames = ["search", "browse"] as const;
export const comparisonSettingsSchema = z.object({
  reasoningEffort: z.enum(reasoningEffortValues).default("high"),
  webSearch: z.boolean().default(false),
  deepResearch: z.boolean().default(false),
  proMode: z.boolean().default(false),
  fastMode: z.boolean().default(false),
  enabledTools: z.array(z.enum(comparisonToolNames)).max(2).default(["search", "browse"]),
});
export type ComparisonSettings = z.infer<typeof comparisonSettingsSchema>;

export function normalizeComparisonSettings(
  model: ModelDefinition | undefined,
  settings: ComparisonSettings,
  webToolsAvailable = true,
): ComparisonSettings {
  const enabledTools = webToolsAvailable ? [...new Set(settings.enabledTools)] : [];
  const searchEnabled = enabledTools.includes("search");
  return {
    reasoningEffort:
      resolveReasoningEffort(model?.efforts ?? false, settings.reasoningEffort) ?? "high",
    proMode: Boolean(model?.supportsProMode && settings.proMode),
    fastMode: Boolean(model?.supportsFastMode && settings.fastMode),
    webSearch: searchEnabled && (settings.webSearch || settings.deepResearch),
    deepResearch: searchEnabled && settings.deepResearch,
    enabledTools,
  };
}
