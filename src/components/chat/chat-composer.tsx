"use client";

import type { ChatStatus } from "ai";
import { useExtracted } from "next-intl";
import { useEffect, useRef } from "react";
import {
  ChatComposerActionMenu,
  ChatComposerTools,
} from "@/components/chat/chat-composer-controls";
import { Composer, type ComposerMessage } from "@/components/chat/composer";
import {
  OPENAI_FAST_MODE_MULTIPLIER,
  OPENAI_PRO_MODE_MULTIPLIER,
  type ModelDefinition,
  type ReasoningEffort,
} from "@/lib/constants";

export type { ComposerMessage };

export type ModelOption = ModelDefinition;

export interface ChatComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (
    message: ComposerMessage,
    options: {
      model: string;
      webSearch: boolean;
      videoMode: boolean;
      imageMode: boolean;
      reasoningEffort: ReasoningEffort;
      proMode: boolean;
      fastMode: boolean;
      deepResearch: boolean;
    },
  ) => void;
  onStop?: () => void;
  placeholder?: string;
  className?: string;
  globalDrop?: boolean;
  status?: ChatStatus;
  isSubmitDisabled?: boolean;
  availableModels: ModelOption[];
  model: string;
  onModelChange: (model: string) => void;
  webSearch: boolean;
  onWebSearchChange: (enabled: boolean) => void;
  webSearchAvailable?: boolean;
  videoMode: boolean;
  onVideoModeChange: (enabled: boolean) => void;
  imageMode: boolean;
  onImageModeChange: (enabled: boolean) => void;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  proMode: boolean;
  onProModeChange: (enabled: boolean) => void;
  fastMode: boolean;
  onFastModeChange: (enabled: boolean) => void;
  deepResearch: boolean;
  onDeepResearchChange: (enabled: boolean) => void;
}

export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  onStop,
  placeholder,
  className,
  globalDrop = true,
  status,
  isSubmitDisabled,
  availableModels,
  model,
  onModelChange,
  webSearch,
  onWebSearchChange,
  webSearchAvailable = true,
  videoMode,
  onVideoModeChange,
  imageMode,
  onImageModeChange,
  reasoningEffort,
  onReasoningEffortChange,
  proMode,
  onProModeChange,
  fastMode,
  onFastModeChange,
  deepResearch,
  onDeepResearchChange,
}: ChatComposerProps) {
  const t = useExtracted();
  const selectedModel = availableModels.find((m) => m.value === model);
  const supportedEfforts = selectedModel?.efforts ?? false;
  const supportsReasoningEffort = supportedEfforts !== false;
  const supportsProMode = Boolean(selectedModel?.supportsProMode);
  const supportsFastMode = Boolean(selectedModel?.supportsFastMode);

  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!globalDrop) {
      return;
    }

    const handleFocusComposer = () => {
      const textarea = composerRef.current?.querySelector<HTMLTextAreaElement>(
        'textarea[name="message"]',
      );
      textarea?.focus();
    };
    window.addEventListener("deni:focus-composer", handleFocusComposer);
    return () => window.removeEventListener("deni:focus-composer", handleFocusComposer);
  }, [globalDrop]);

  const handleVideoToggle = (enabled: boolean) => {
    onVideoModeChange(enabled);
    if (enabled) {
      onWebSearchChange(false);
      onImageModeChange(false);
    }
  };

  const handleImageToggle = (enabled: boolean) => {
    onImageModeChange(enabled);
    if (enabled) {
      onWebSearchChange(false);
      onVideoModeChange(false);
    }
  };

  const handleSearchToggle = (enabled: boolean) => {
    onWebSearchChange(enabled);
    if (enabled) {
      onVideoModeChange(false);
      onImageModeChange(false);
    }
    if (!enabled) {
      onDeepResearchChange(false);
    }
  };

  const handleResearchToggle = (enabled: boolean) => {
    onDeepResearchChange(enabled);
    if (enabled) {
      onWebSearchChange(true);
      onVideoModeChange(false);
      onImageModeChange(false);
    }
  };

  const handleSubmit = (message: ComposerMessage) => {
    onSubmit(message, {
      model,
      webSearch,
      videoMode,
      imageMode,
      reasoningEffort,
      proMode: supportsProMode && proMode,
      fastMode: supportsFastMode && fastMode,
      deepResearch,
    });
  };

  const proModeTitle = t(
    "Pro mode uses deeper multi-pass reasoning ({multiplier}× premium usage)",
    {
      multiplier: String(OPENAI_PRO_MODE_MULTIPLIER),
    },
  );
  const fastModeTitle = t(
    "Fast mode uses priority processing for lower latency ({multiplier}× usage)",
    {
      multiplier: String(OPENAI_FAST_MODE_MULTIPLIER),
    },
  );

  const resolvedPlaceholder =
    placeholder ??
    (videoMode
      ? t("Describe the video scene, style, motion, and lighting.")
      : imageMode
        ? t("Describe the image you want to generate.")
        : undefined);

  return (
    <div ref={composerRef}>
      <Composer
        onSubmit={handleSubmit}
        onStop={onStop}
        className={className}
        globalDrop={globalDrop}
        multiple
        placeholder={resolvedPlaceholder}
        headerClassName="py-0.5!"
        value={value}
        onValueChange={onValueChange}
        status={status}
        isSubmitDisabled={isSubmitDisabled}
        actionMenuItems={
          <ChatComposerActionMenu
            webSearch={webSearch}
            onSearchToggle={handleSearchToggle}
            webSearchAvailable={webSearchAvailable}
            deepResearch={deepResearch}
            onResearchToggle={handleResearchToggle}
            supportsFastMode={supportsFastMode}
            fastMode={fastMode}
            onFastModeChange={onFastModeChange}
            supportsProMode={supportsProMode}
            proMode={proMode}
            onProModeChange={onProModeChange}
            reasoningEffort={reasoningEffort}
            onReasoningEffortChange={onReasoningEffortChange}
            supportedEfforts={supportedEfforts}
            supportsReasoningEffort={supportsReasoningEffort}
          />
        }
        tools={
          <ChatComposerTools
            value={value}
            onValueChange={onValueChange}
            videoMode={videoMode}
            onVideoToggle={handleVideoToggle}
            imageMode={imageMode}
            onImageToggle={handleImageToggle}
            webSearch={webSearch}
            onSearchToggle={handleSearchToggle}
            deepResearch={deepResearch}
            onResearchToggle={handleResearchToggle}
            model={model}
            onModelChange={onModelChange}
            availableModels={availableModels}
            selectedModel={selectedModel}
            reasoningEffort={reasoningEffort}
            onReasoningEffortChange={onReasoningEffortChange}
            supportedEfforts={supportedEfforts}
            supportsReasoningEffort={supportsReasoningEffort}
            supportsFastMode={supportsFastMode}
            fastMode={fastMode}
            onFastModeChange={onFastModeChange}
            fastModeTitle={fastModeTitle}
            supportsProMode={supportsProMode}
            proMode={proMode}
            onProModeChange={onProModeChange}
            proModeTitle={proModeTitle}
          />
        }
      />
    </div>
  );
}
