"use client";

import { useId } from "react";
import { useExtracted } from "next-intl";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  isReasoningEffort,
  OPENAI_FAST_MODE_MULTIPLIER,
  OPENAI_PRO_MODE_MULTIPLIER,
  type ModelDefinition,
  type ReasoningEffort,
} from "@/lib/constants";
import { normalizeComparisonSettings, type ComparisonSettings } from "@/lib/comparison-settings";

export function ComparisonSettingsControls({
  model,
  settings,
  onChange,
  disabled,
  webToolsAvailable,
}: {
  model: ModelDefinition | undefined;
  settings: ComparisonSettings;
  onChange: (settings: ComparisonSettings) => void;
  disabled: boolean;
  webToolsAvailable: boolean;
}) {
  const t = useExtracted();
  const id = useId();
  const current = normalizeComparisonSettings(model, settings, webToolsAvailable);
  const efforts = model?.efforts ?? false;
  const labels: Record<ReasoningEffort, string> = {
    none: t("None"),
    minimal: t("Minimal"),
    low: t("Light"),
    medium: t("Medium"),
    high: t("High"),
    xhigh: t("Extra High"),
    max: t("Max"),
  };
  function change(patch: Partial<ComparisonSettings>) {
    onChange(normalizeComparisonSettings(model, { ...current, ...patch }, webToolsAvailable));
  }
  function toggleTool(tool: "search" | "browse", enabled: boolean) {
    change({
      enabledTools: enabled
        ? [...current.enabledTools, tool]
        : current.enabledTools.filter((value) => value !== tool),
    });
  }
  const searchAllowed = current.enabledTools.includes("search");
  const toggles = [
    {
      key: "webSearch" as const,
      label: t("Search"),
      hidden: !webToolsAvailable,
      unavailable: !searchAllowed,
      change: (enabled: boolean) =>
        change({ webSearch: enabled, ...(!enabled ? { deepResearch: false } : {}) }),
    },
    {
      key: "deepResearch" as const,
      label: t("Deep Research"),
      hidden: !webToolsAvailable,
      unavailable: !searchAllowed,
      change: (enabled: boolean) =>
        change({ deepResearch: enabled, ...(enabled ? { webSearch: true } : {}) }),
    },
    {
      key: "proMode" as const,
      label: t("Pro"),
      hidden: !model?.supportsProMode,
      unavailable: false,
      change: (enabled: boolean) => change({ proMode: enabled }),
    },
    {
      key: "fastMode" as const,
      label: t("Fast"),
      hidden: !model?.supportsFastMode,
      unavailable: false,
      change: (enabled: boolean) => change({ fastMode: enabled }),
    },
  ];
  return (
    <details className="text-xs">
      <summary className="cursor-pointer py-1">
        {t("Generation settings")} · {efforts ? labels[current.reasoningEffort] : t("None")}
      </summary>
      <FieldSet
        disabled={disabled}
        className="max-h-72 overflow-y-auto rounded-lg border p-3 gap-4"
      >
        <FieldLegend className="sr-only">{t("Generation settings")}</FieldLegend>
        <FieldGroup className="gap-3">
          <Field data-disabled={disabled || !efforts}>
            <FieldLabel htmlFor={`${id}-effort`}>{t("Reasoning effort")}</FieldLabel>
            <Select
              value={current.reasoningEffort}
              disabled={disabled || !efforts}
              onValueChange={(value) => {
                if (typeof value === "string" && isReasoningEffort(value))
                  change({ reasoningEffort: value });
              }}
            >
              <SelectTrigger id={`${id}-effort`} size="sm" className="w-full">
                <SelectValue>{efforts ? labels[current.reasoningEffort] : t("None")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {efforts &&
                  efforts.map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {labels[effort]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          {toggles
            .filter((toggle) => !toggle.hidden)
            .map((toggle) => (
              <Field
                key={toggle.key}
                orientation="horizontal"
                data-disabled={disabled || toggle.unavailable}
              >
                <FieldLabel htmlFor={`${id}-${toggle.key}`}>{toggle.label}</FieldLabel>
                <Switch
                  id={`${id}-${toggle.key}`}
                  size="sm"
                  checked={current[toggle.key]}
                  disabled={disabled || toggle.unavailable}
                  onCheckedChange={toggle.change}
                />
              </Field>
            ))}
          {model?.supportsProMode && (
            <FieldDescription className="text-xs">
              {t("Pro mode uses deeper multi-pass reasoning ({multiplier}× premium usage)", {
                multiplier: String(OPENAI_PRO_MODE_MULTIPLIER),
              })}
            </FieldDescription>
          )}
          {model?.supportsFastMode && (
            <FieldDescription className="text-xs">
              {t("Fast mode uses priority processing for lower latency ({multiplier}× usage)", {
                multiplier: String(OPENAI_FAST_MODE_MULTIPLIER),
              })}
            </FieldDescription>
          )}
        </FieldGroup>
        {webToolsAvailable && (
          <FieldSet className="gap-2">
            <FieldLegend variant="label">{t("Allowed tools")}</FieldLegend>
            <FieldDescription className="text-xs">
              {t(
                "Allowed tools may be used automatically. Search requires a lookup for the next answer.",
              )}
            </FieldDescription>
            <FieldGroup className="gap-3">
              {(["search", "browse"] as const).map((tool) => (
                <Field key={tool} orientation="horizontal" data-disabled={disabled}>
                  <FieldLabel htmlFor={`${id}-${tool}`}>
                    {tool === "search" ? t("Search tool") : t("Browse tool")}
                  </FieldLabel>
                  <Switch
                    id={`${id}-${tool}`}
                    size="sm"
                    disabled={disabled}
                    checked={current.enabledTools.includes(tool)}
                    onCheckedChange={(enabled) => toggleTool(tool, enabled)}
                  />
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
        )}
        <FieldDescription className="text-xs">
          {t("Settings apply to the next answer and are saved with the comparison.")}
        </FieldDescription>
      </FieldSet>
    </details>
  );
}
