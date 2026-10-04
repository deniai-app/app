"use client";

import type { LucideIcon } from "lucide-react";
import { BrainIcon, Globe, Lightbulb, Mic, Sparkle, Zap, XIcon } from "lucide-react";
import { useExtracted } from "next-intl";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { ChatComposerModelPicker } from "@/components/chat/chat-composer-model-picker";
import {
  isReasoningEffort,
  type ModelDefinition,
  type ModelEfforts,
  type ReasoningEffort,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenuCheckboxItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type ToolChipProps = {
  icon: LucideIcon;
  label: string;
  onRemove: () => void;
};

function ToolChip({ icon: Icon, label, onRemove }: ToolChipProps) {
  const t = useExtracted();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="group bg-zinc-800 text-white hover:bg-zinc-700 hover:text-white dark:bg-zinc-700 dark:hover:bg-zinc-600"
      onClick={onRemove}
      aria-label={t("Remove {label}", { label })}
    >
      <Icon className="size-3.5 group-hover:hidden group-focus-visible:hidden" aria-hidden="true" />
      <XIcon
        className="size-3.5 hidden group-hover:block group-focus-visible:block"
        aria-hidden="true"
      />
    </Button>
  );
}

function ChatComposerReasoningSelect({
  reasoningEffort,
  onReasoningEffortChange,
  supportedEfforts,
  supportsReasoningEffort,
  triggerClassName,
}: {
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  supportedEfforts: ModelEfforts;
  supportsReasoningEffort: boolean;
  triggerClassName?: string;
}) {
  const t = useExtracted();
  const reasoningEffortLabels: Record<ReasoningEffort, string> = {
    none: t("None"),
    minimal: t("Minimal"),
    low: t("Light"),
    medium: t("Medium"),
    high: t("High"),
    xhigh: t("Extra High"),
    max: t("Max"),
  };
  const reasoningEffortLabel = reasoningEffortLabels[reasoningEffort] ?? reasoningEffort;

  return (
    <PromptInputSelect
      value={reasoningEffort}
      onValueChange={(value) => {
        if (typeof value === "string" && isReasoningEffort(value)) {
          onReasoningEffortChange(value);
        }
      }}
      disabled={!supportsReasoningEffort}
    >
      <PromptInputSelectTrigger size="sm" className={cn(triggerClassName)}>
        <PromptInputSelectValue>
          <BrainIcon className="size-4" aria-hidden="true" />
          {reasoningEffortLabel}
        </PromptInputSelectValue>
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {supportedEfforts !== false &&
          supportedEfforts.map((effort) => (
            <PromptInputSelectItem key={effort} value={effort}>
              {reasoningEffortLabels[effort] ?? effort}
            </PromptInputSelectItem>
          ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
}

function GuestLoginHint() {
  const t = useExtracted();

  return <span className="ml-auto pl-2 text-xs text-muted-foreground">{t("Log in to use")}</span>;
}

export function ChatComposerActionMenu({
  webSearch,
  onSearchToggle,
  webSearchAvailable,
  isGuest,
  deepResearch,
  onResearchToggle,
  supportsFastMode,
  fastMode,
  onFastModeChange,
  supportsProMode,
  proMode,
  onProModeChange,
  reasoningEffort,
  onReasoningEffortChange,
  supportedEfforts,
  supportsReasoningEffort,
}: {
  webSearch: boolean;
  onSearchToggle: (enabled: boolean) => void;
  webSearchAvailable: boolean;
  isGuest: boolean;
  deepResearch: boolean;
  onResearchToggle: (enabled: boolean) => void;
  supportsFastMode: boolean;
  fastMode: boolean;
  onFastModeChange: (enabled: boolean) => void;
  supportsProMode: boolean;
  proMode: boolean;
  onProModeChange: (enabled: boolean) => void;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  supportedEfforts: ModelEfforts;
  supportsReasoningEffort: boolean;
}) {
  const t = useExtracted();

  return (
    <>
      <DropdownMenuSeparator />
      {webSearchAvailable && (
        <DropdownMenuCheckboxItem
          checked={webSearch}
          onCheckedChange={(checked) => onSearchToggle(Boolean(checked))}
        >
          <Globe className="size-4" aria-hidden="true" />
          {t("Search")}
        </DropdownMenuCheckboxItem>
      )}
      {webSearchAvailable && (
        <DropdownMenuCheckboxItem
          checked={deepResearch && !isGuest}
          disabled={isGuest}
          onCheckedChange={(checked) => onResearchToggle(Boolean(checked))}
        >
          <Sparkle className="size-4" aria-hidden="true" />
          {t("Deep Research")}
          {isGuest && <GuestLoginHint />}
        </DropdownMenuCheckboxItem>
      )}
      {supportsFastMode && (
        <DropdownMenuCheckboxItem
          checked={fastMode && !isGuest}
          disabled={isGuest}
          onCheckedChange={(checked) => onFastModeChange(Boolean(checked))}
        >
          <Zap className="size-4" aria-hidden="true" />
          {t("Fast")}
          {isGuest && <GuestLoginHint />}
        </DropdownMenuCheckboxItem>
      )}
      {supportsProMode && (
        <DropdownMenuCheckboxItem
          checked={proMode && !isGuest}
          disabled={isGuest}
          onCheckedChange={(checked) => onProModeChange(Boolean(checked))}
        >
          <Lightbulb className="size-4" aria-hidden="true" />
          {t("Pro")}
          {isGuest && <GuestLoginHint />}
        </DropdownMenuCheckboxItem>
      )}
      <div className="px-2 py-1.5 md:hidden">
        <ChatComposerReasoningSelect
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={onReasoningEffortChange}
          supportedEfforts={supportedEfforts}
          supportsReasoningEffort={supportsReasoningEffort}
          triggerClassName="w-full justify-between"
        />
      </div>
    </>
  );
}

export function ChatComposerVoiceInput({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const t = useExtracted();

  return (
    <SpeechInput
      size="icon-sm"
      variant="ghost"
      className="size-8 shrink-0 bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label={t("Voice input")}
      title={t("Voice input")}
      onTranscriptionChange={(transcript) => {
        const nextValue = value.trim() ? `${value.trim()} ${transcript}` : transcript;
        onValueChange(nextValue.trim());
      }}
    >
      <Mic className="size-4" />
    </SpeechInput>
  );
}

function ModeToggleButton({
  icon: Icon,
  label,
  tooltip,
  active,
  locked,
  activeClassName,
  onToggle,
}: {
  icon: LucideIcon;
  label: string;
  tooltip: string;
  active: boolean;
  locked: boolean;
  activeClassName: string;
  onToggle: () => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="icon-sm"
              aria-disabled={locked}
              className={cn(
                "size-8",
                locked && "cursor-not-allowed opacity-50",
                active ? activeClassName : "text-muted-foreground",
              )}
              aria-pressed={active}
              aria-label={label}
              onClick={() => !locked && onToggle()}
            />
          }
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ChatComposerTools({
  webSearch,
  onSearchToggle,
  isGuest,
  deepResearch,
  onResearchToggle,
  model,
  onModelChange,
  availableModels,
  selectedModel,
  reasoningEffort,
  onReasoningEffortChange,
  supportedEfforts,
  supportsReasoningEffort,
  supportsFastMode,
  fastMode,
  onFastModeChange,
  fastModeTitle,
  supportsProMode,
  proMode,
  onProModeChange,
  proModeTitle,
}: {
  webSearch: boolean;
  onSearchToggle: (enabled: boolean) => void;
  isGuest: boolean;
  deepResearch: boolean;
  onResearchToggle: (enabled: boolean) => void;
  model: string;
  onModelChange: (model: string) => void;
  availableModels: ModelDefinition[];
  selectedModel: ModelDefinition | undefined;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  supportedEfforts: ModelEfforts;
  supportsReasoningEffort: boolean;
  supportsFastMode: boolean;
  fastMode: boolean;
  onFastModeChange: (enabled: boolean) => void;
  fastModeTitle: string;
  supportsProMode: boolean;
  proMode: boolean;
  onProModeChange: (enabled: boolean) => void;
  proModeTitle: string;
}) {
  const t = useExtracted();

  return (
    <>
      {webSearch && (
        <ToolChip icon={Globe} label={t("Search")} onRemove={() => onSearchToggle(false)} />
      )}
      {deepResearch && !isGuest && (
        <ToolChip
          icon={Sparkle}
          label={t("Deep Research")}
          onRemove={() => onResearchToggle(false)}
        />
      )}

      <ChatComposerModelPicker
        model={model}
        onModelChange={onModelChange}
        availableModels={availableModels}
        selectedModel={selectedModel}
      />

      <div className="hidden md:flex md:items-center md:gap-1">
        <ChatComposerReasoningSelect
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={onReasoningEffortChange}
          supportedEfforts={supportedEfforts}
          supportsReasoningEffort={supportsReasoningEffort}
        />
        {supportsFastMode && (
          <ModeToggleButton
            icon={Zap}
            label={t("Fast")}
            tooltip={isGuest ? t("Log in to use Fast mode") : fastModeTitle}
            active={fastMode && !isGuest}
            locked={isGuest}
            activeClassName="bg-sky-500/15 text-sky-700 hover:bg-sky-500/20 dark:text-sky-400"
            onToggle={() => onFastModeChange(!fastMode)}
          />
        )}
        {supportsProMode && (
          <ModeToggleButton
            icon={Lightbulb}
            label={t("Pro")}
            tooltip={isGuest ? t("Log in to use Pro mode") : proModeTitle}
            active={proMode && !isGuest}
            locked={isGuest}
            activeClassName="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
            onToggle={() => onProModeChange(!proMode)}
          />
        )}
      </div>
    </>
  );
}
