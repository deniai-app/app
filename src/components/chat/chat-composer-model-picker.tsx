"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import SiAnthropic from "@icons-pack/react-simple-icons/icons/SiAnthropic";
import SiGooglegemini from "@icons-pack/react-simple-icons/icons/SiGooglegemini";
import SiX from "@icons-pack/react-simple-icons/icons/SiX";
import {
  ArchiveIcon,
  ArrowBigUpDash,
  Bot,
  BrainCircuit,
  ChevronDownIcon,
  Code,
  Coins,
  CreditCard,
  Gem,
  LogIn,
  SearchIcon,
  Sparkle,
  StarIcon,
  TriangleAlert,
} from "lucide-react";
import { useExtracted, useLocale } from "next-intl";
import { useState } from "react";
import Openai from "@/components/openai";
import { useAvailableModels } from "@/hooks/use-available-models";
import { formatModelDeprecationDate } from "@/lib/constants";
import { translateModelDescription, useModelDescriptionCopy } from "@/lib/model-description-copy";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ModelOption } from "./chat-composer";

type ModelDescriptionLabels = {
  xaiMostIntelligentModel: string;
  fastAndEfficientModel: string;
  stealthModel: string;
};

type FeatureLabels = {
  reasoning: string;
  smart: string;
  fast: string;
  coding: string;
  fastest: string;
  smartest: string;
};

type ProviderLabels = {
  featured: string;
};

function getModelDescription(value: string, labels: ModelDescriptionLabels): string {
  switch (value) {
    case "grok-4.5":
    case "grok-4.3":
      return labels.xaiMostIntelligentModel;
    case "grok-4.20":
    case "grok-4.20-multi-agent":
    case "grok-build-0.1":
      return labels.fastAndEfficientModel;
    case "healer-alpha":
    case "hunter-alpha":
      return labels.stealthModel;
    default:
      return value;
  }
}

function getFeatureLabel(feature: string, labels: FeatureLabels): string {
  switch (feature) {
    case "reasoning":
      return labels.reasoning;
    case "smart":
      return labels.smart;
    case "fast":
      return labels.fast;
    case "coding":
      return labels.coding;
    case "fastest":
      return labels.fastest;
    case "smartest":
      return labels.smartest;
    default:
      return feature;
  }
}

function ModelIcon({
  model,
  className,
}: {
  model: { author: ModelOption["author"]; premium?: boolean };
  className?: string;
}) {
  if (model.premium) return <Gem className={cn("size-3.5", className)} aria-hidden="true" />;
  switch (model.author) {
    case "openai":
      return <Openai aria-hidden="true" />;
    case "anthropic":
      return <SiAnthropic className={cn("size-3.5", className)} aria-hidden="true" />;
    case "google":
      return <SiGooglegemini className={cn("size-3.5", className)} aria-hidden="true" />;
    case "xai":
      return <SiX className={cn("size-3.5", className)} aria-hidden="true" />;
    default:
      return <Bot className={cn("size-3.5", className)} aria-hidden="true" />;
  }
}

function ProviderIcon({ author }: { author: string }) {
  switch (author) {
    case "featured":
      return <Sparkle className="size-3.5" aria-hidden="true" />;
    case "openai":
      return <Openai aria-hidden="true" />;
    case "anthropic":
      return <SiAnthropic className="size-3.5" aria-hidden="true" />;
    case "google":
      return <SiGooglegemini className="size-3.5" aria-hidden="true" />;
    case "xai":
      return <SiX className="size-3.5" aria-hidden="true" />;
    default:
      return <Bot className="size-3.5" aria-hidden="true" />;
  }
}

function getProviderLabel(author: string, labels: ProviderLabels): string {
  switch (author) {
    case "featured":
      return labels.featured;
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "google":
      return "Google";
    case "xai":
      return "xAI";
    default:
      return author;
  }
}

function useModelDeprecationCopy(deprecation: ModelOption["deprecation"]) {
  const t = useExtracted();
  const locale = useLocale();
  const date = deprecation ? formatModelDeprecationDate(deprecation.date, locale) : null;
  if (!date) {
    return { warning: null, label: null };
  }
  if (deprecation?.tentative) {
    return {
      warning: t("This model is not expected to retire before {date}.", { date }),
      label: t("Earliest retirement {date}", { date }),
    };
  }
  if (deprecation?.kind === "retirement") {
    return {
      warning: t("This model is scheduled to retire on {date}.", { date }),
      label: t("Retires {date}", { date }),
    };
  }
  return {
    warning: t("This model is scheduled to be shut down on {date}.", { date }),
    label: t("Shutdown {date}", { date }),
  };
}

function ProviderSidebar({
  providers,
  counts,
  selectedProvider,
  labels,
  onSelect,
}: {
  providers: string[];
  counts: Record<string, ModelOption[]>;
  selectedProvider: string;
  labels: ProviderLabels;
  onSelect: (provider: string) => void;
}) {
  return (
    <div className="w-32 shrink-0 border-r flex flex-col gap-0.5 overflow-y-auto overscroll-contain bg-muted/30 p-1.5 [-webkit-overflow-scrolling:touch] sm:w-40">
      {providers.map((provider) => {
        const isActive = selectedProvider === provider;
        const isFeatured = provider === "featured";
        return (
          <button
            key={provider}
            type="button"
            onClick={() => onSelect(provider)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              isFeatured && isActive && "text-yellow-600 dark:text-yellow-400",
              isFeatured && !isActive && "hover:text-yellow-600 dark:hover:text-yellow-400",
            )}
          >
            <span className="shrink-0 flex items-center [&_svg]:size-3.5">
              <ProviderIcon author={provider} />
            </span>
            <span className="flex-1 truncate leading-none">
              {getProviderLabel(provider, labels)}
            </span>
            <span className="tabular-nums text-xs opacity-50 shrink-0">
              {counts[provider]?.length ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ModelPickerNotice({
  icon: Icon,
  message,
  href,
  actionLabel,
}: {
  icon: LucideIcon;
  message: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t bg-muted/30 p-3 text-muted-foreground">
      <div className="flex items-start gap-2">
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <p>{message}</p>
      </div>
      <Button
        render={<Link href={href} />}
        nativeButton={false}
        variant="outline"
        size="sm"
        className="self-start"
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function ModelPickerFooter({
  isAnonymous,
  shouldVerifyCard,
}: {
  isAnonymous: boolean;
  shouldVerifyCard: boolean;
}) {
  const t = useExtracted();

  return (
    <>
      {isAnonymous && (
        <ModelPickerNotice
          icon={LogIn}
          message={t("Log in to use more models")}
          href="/auth/sign-in?redirectTo=/chat"
          actionLabel={t("Log in")}
        />
      )}
      {shouldVerifyCard && (
        <ModelPickerNotice
          icon={CreditCard}
          message={t("Verify your card to unlock more models")}
          href="/settings/billing"
          actionLabel={t("Verify card")}
        />
      )}
    </>
  );
}

function ModelPickerItem({
  model,
  isSelected,
  onSelect,
  featureLabels,
  modelDescriptionLabels,
  modelDescriptionCopy,
}: {
  model: ModelOption;
  isSelected: boolean;
  onSelect: () => void;
  featureLabels: FeatureLabels;
  modelDescriptionLabels: ModelDescriptionLabels;
  modelDescriptionCopy: Record<string, string>;
}) {
  const t = useExtracted();
  const description =
    "description" in model
      ? translateModelDescription(model, modelDescriptionCopy)
      : getModelDescription(model.value, modelDescriptionLabels);
  const { warning: deprecationWarning, label: deprecationLabel } = useModelDeprecationCopy(
    model.deprecation,
  );
  const highlightFeatures = model.features.filter((f) => f.includes("est"));
  const regularFeatures = model.features.filter((f) => !f.includes("est"));

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex flex-col gap-1 rounded-md p-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected ? "bg-accent/70 text-accent-foreground" : "text-foreground hover:bg-accent/40",
      )}
    >
      <span className="flex items-center gap-1.5 font-medium text-sm leading-none flex-wrap">
        <span className="shrink-0 flex items-center [&_svg]:size-3.5">
          <ModelIcon model={model} />
        </span>
        <span>{model.name}</span>
        {deprecationWarning && deprecationLabel && (
          <Badge
            variant="secondary"
            className="bg-orange-500/15 text-orange-700 dark:text-orange-400 text-[10px] leading-none py-0.5 h-auto"
            title={deprecationWarning}
            aria-label={deprecationWarning}
          >
            <TriangleAlert className="size-3" aria-hidden="true" />
            {deprecationLabel}
          </Badge>
        )}
        {"tokenMultiplier" in model &&
          typeof model.tokenMultiplier === "number" &&
          model.tokenMultiplier > 1 && (
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] leading-none py-0.5 h-auto"
              title={t("Each token counts {multiplier}× toward your usage", {
                multiplier: String(model.tokenMultiplier),
              })}
            >
              <Coins className="size-3" aria-hidden="true" />
              {model.tokenMultiplier}x
            </Badge>
          )}
        {highlightFeatures.map((feature) => (
          <Badge
            variant="secondary"
            className="bg-primary/10 text-[10px] leading-none px-1 py-0.5 h-auto"
            key={feature}
          >
            <StarIcon
              className="size-3 text-yellow-500 dark:fill-yellow-400 mr-0.5"
              aria-hidden="true"
            />
            {getFeatureLabel(feature, featureLabels)}
          </Badge>
        ))}
      </span>

      {description && (
        <span className="text-xs text-muted-foreground leading-snug pl-5">{description}</span>
      )}

      {regularFeatures.length > 0 && (
        <span className="flex gap-1 flex-wrap pl-5">
          {regularFeatures.map((feature) => (
            <Badge
              variant="secondary"
              className="bg-primary/10 text-[10px] leading-none px-1 py-0.5 h-auto"
              key={feature}
            >
              {(() => {
                switch (feature) {
                  case "smart":
                    return <Sparkle className="size-3 mr-0.5" aria-hidden="true" />;
                  case "reasoning":
                    return <BrainCircuit className="size-3 mr-0.5" aria-hidden="true" />;
                  case "fast":
                    return <ArrowBigUpDash className="size-3 mr-0.5" aria-hidden="true" />;
                  case "coding":
                    return <Code className="size-3 mr-0.5" aria-hidden="true" />;
                  default:
                    return null;
                }
              })()}
              {getFeatureLabel(feature, featureLabels)}
            </Badge>
          ))}
        </span>
      )}
    </button>
  );
}

function groupModelsByProvider(models: ModelOption[]): Record<string, ModelOption[]> {
  const groups: Record<string, ModelOption[]> = {};
  const featured = models.filter((m) => "featured" in m && m.featured === true);
  if (featured.length > 0) {
    groups["featured"] = featured;
  }
  for (const m of models) {
    const key = m.author ?? "other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }
  return groups;
}

function filterProviderGroups(
  groups: Record<string, ModelOption[]>,
  query: string,
  getDescription: (entry: ModelOption) => string | undefined,
): Record<string, ModelOption[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return groups;
  }

  const filtered: Record<string, ModelOption[]> = {};
  for (const [provider, entries] of Object.entries(groups)) {
    const matches = entries.filter((entry) =>
      [entry.name, entry.value, entry.author, provider, getDescription(entry), ...entry.features]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
    if (matches.length > 0) {
      filtered[provider] = matches;
    }
  }
  return filtered;
}

function ModelPickerTriggerLabel({ selectedModel }: { selectedModel: ModelOption | undefined }) {
  const t = useExtracted();
  const { warning } = useModelDeprecationCopy(selectedModel?.deprecation);
  const multiplier =
    selectedModel && "tokenMultiplier" in selectedModel ? selectedModel.tokenMultiplier : undefined;

  return (
    <>
      <span className="flex items-center [&_svg]:size-3.5">
        <ModelIcon model={selectedModel ?? { author: "openai", premium: false }} />
      </span>
      <span className="max-w-30 truncate text-sm">{selectedModel?.name ?? t("Select model")}</span>
      {warning && (
        <Badge
          variant="secondary"
          className="bg-orange-500/15 text-orange-700 dark:text-orange-400 text-[10px] leading-none px-1 py-0.5 h-auto"
          title={warning}
          aria-label={warning}
        >
          <TriangleAlert className="size-3" aria-hidden="true" />
        </Badge>
      )}
      {typeof multiplier === "number" && multiplier > 1 && (
        <Badge
          variant="secondary"
          className="bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] leading-none px-1 py-0.5 h-auto"
          title={t("Each token counts {multiplier}× toward your usage", {
            multiplier: String(multiplier),
          })}
        >
          <Coins className="size-3 mr-0.5" aria-hidden="true" />
          {multiplier}x
        </Badge>
      )}
      <ChevronDownIcon className="size-3 opacity-50 shrink-0" aria-hidden="true" />
    </>
  );
}

function ModelPickerList({
  activeModels,
  legacyModels,
  selectedValue,
  legacyOpen,
  onLegacyOpenChange,
  featureLabels,
  modelDescriptionLabels,
  modelDescriptionCopy,
  onSelect,
}: {
  activeModels: ModelOption[];
  legacyModels: ModelOption[];
  selectedValue: string;
  legacyOpen: boolean;
  onLegacyOpenChange: (open: boolean) => void;
  featureLabels: FeatureLabels;
  modelDescriptionLabels: ModelDescriptionLabels;
  modelDescriptionCopy: Record<string, string>;
  onSelect: (value: string) => void;
}) {
  const t = useExtracted();

  if (activeModels.length === 0 && legacyModels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">{t("No models available")}</p>
    );
  }

  const renderItem = (m: ModelOption) => (
    <ModelPickerItem
      key={m.value}
      model={m}
      isSelected={m.value === selectedValue}
      featureLabels={featureLabels}
      modelDescriptionLabels={modelDescriptionLabels}
      modelDescriptionCopy={modelDescriptionCopy}
      onSelect={() => onSelect(m.value)}
    />
  );

  return (
    <>
      {activeModels.map(renderItem)}

      {legacyModels.length > 0 && (
        <Collapsible open={legacyOpen} onOpenChange={onLegacyOpenChange}>
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            <ArchiveIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              {t("{count, plural, one {# legacy model} other {# legacy models}}", {
                count: legacyModels.length,
              })}
            </span>
            <ChevronDownIcon
              className={cn("size-4 shrink-0 transition-transform", legacyOpen && "rotate-180")}
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 flex flex-col gap-0.5">
            {legacyModels.map(renderItem)}
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}

export interface ChatComposerModelPickerProps {
  model: string;
  onModelChange: (model: string) => void;
  availableModels: ModelOption[];
  selectedModel: ModelOption | undefined;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function ChatComposerModelPicker({
  model,
  onModelChange,
  availableModels,
  selectedModel,
  disabled = false,
  ariaLabel,
  className,
}: ChatComposerModelPickerProps) {
  const { shouldVerifyCard, isAnonymous } = useAvailableModels();
  const t = useExtracted();
  const modelDescriptionLabels: ModelDescriptionLabels = {
    xaiMostIntelligentModel: t("xAI's most intelligent model"),
    fastAndEfficientModel: t("Fast and efficient model"),
    stealthModel: t("Stealth model"),
  };
  const modelDescriptionCopy = useModelDescriptionCopy();
  const featureLabels: FeatureLabels = {
    reasoning: t("Reasoning"),
    smart: t("Smart"),
    fast: t("Fast"),
    coding: t("Coding"),
    fastest: t("Fastest"),
    smartest: t("Smartest"),
  };
  const providerLabels: ProviderLabels = {
    featured: t("Featured"),
  };
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("featured");
  const [legacyModelsOpen, setLegacyModelsOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");

  const providerGroups = groupModelsByProvider(availableModels);
  const filteredProviderGroups = filterProviderGroups(providerGroups, modelQuery, (entry) =>
    "description" in entry
      ? translateModelDescription(entry, modelDescriptionCopy)
      : getModelDescription(entry.value, modelDescriptionLabels),
  );
  const availableProviders = Object.keys(filteredProviderGroups);
  const currentProviderModels = filteredProviderGroups[selectedProvider] ?? [];
  const activeModels = currentProviderModels.filter((entry) => entry.default !== false);
  const legacyModels = currentProviderModels.filter((entry) => entry.default === false);

  if (availableProviders.length > 0 && !availableProviders.includes(selectedProvider)) {
    setSelectedProvider(availableProviders[0]);
  }

  const handleModelPopoverOpenChange = (open: boolean) => {
    if (open && disabled) return;
    if (open) {
      setModelQuery("");
      setLegacyModelsOpen(false);
      const isFeatured =
        selectedModel && "featured" in selectedModel && selectedModel.featured === true;
      setSelectedProvider(
        isFeatured || providerGroups["featured"] ? "featured" : (selectedModel?.author ?? "openai"),
      );
    }
    setModelPopoverOpen(open);
  };

  return (
    <Popover open={modelPopoverOpen && !disabled} onOpenChange={handleModelPopoverOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              "h-auto gap-1.5 border-none bg-transparent px-2 py-1.5 font-medium text-muted-foreground shadow-none transition-colors dark:bg-input/30",
              "hover:bg-accent hover:text-foreground data-popup-open:bg-accent data-popup-open:text-foreground",
              className,
            )}
          />
        }
      >
        <ModelPickerTriggerLabel selectedModel={selectedModel} />
      </PopoverTrigger>
      <PopoverContent
        className="flex w-[calc(100vw-1rem)] max-w-125 max-h-[min(31rem,var(--available-height))] flex-col overflow-hidden p-0 shadow-lg sm:w-125"
        side="top"
        align="start"
        sideOffset={8}
      >
        <div className="flex min-h-0 flex-1 flex-col rounded-[inherit]">
          <div className="shrink-0 border-b">
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
                placeholder={t("Search")}
                aria-label={t("Search")}
                className="pl-8 rounded-b-none"
              />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ProviderSidebar
              providers={availableProviders}
              counts={filteredProviderGroups}
              selectedProvider={selectedProvider}
              labels={providerLabels}
              onSelect={setSelectedProvider}
            />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 [-webkit-overflow-scrolling:touch]">
                <ModelPickerList
                  activeModels={activeModels}
                  legacyModels={legacyModels}
                  selectedValue={model}
                  legacyOpen={legacyModelsOpen}
                  onLegacyOpenChange={setLegacyModelsOpen}
                  featureLabels={featureLabels}
                  modelDescriptionLabels={modelDescriptionLabels}
                  modelDescriptionCopy={modelDescriptionCopy}
                  onSelect={(value) => {
                    onModelChange(value);
                    setModelPopoverOpen(false);
                  }}
                />
              </div>
              <ModelPickerFooter isAnonymous={isAnonymous} shouldVerifyCard={shouldVerifyCard} />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
