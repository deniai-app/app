"use client";

import type { UIMessage } from "ai";
import {
  ArrowUpIcon,
  BrainIcon,
  CheckIcon,
  CopyIcon,
  Globe,
  ListFilterIcon,
  RefreshCcwIcon,
  SquareIcon,
  Volume2Icon,
} from "lucide-react";
import { useExtracted, useLocale } from "next-intl";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import { memo, useState } from "react";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  AssistantMessageChainOfThought,
  AssistantMessageImageParts,
  AssistantMessageSources,
  AssistantMessageVideoParts,
} from "@/components/chat/assistant-message-parts";
import {
  AssistantMessageQuestionnaireParts,
  isQuestionnaireInput,
  isQuestionnaireToolPart,
} from "@/components/chat/questionnaire-tool";
import type { QuestionnaireToolOutput } from "@/lib/chat-tools/questionnaire";
import { isImageToolPart, isVideoToolPart } from "@/components/chat/chat-utils";
import type { ReasoningEffort } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModelOption } from "./chat-composer";

interface RequestBody {
  model: string;
  webSearch: boolean;
  reasoningEffort: ReasoningEffort;
  proMode?: boolean;
  fastMode?: boolean;
  id: string;
  deepResearch?: boolean;
  responseStyle?: "retry" | "detailed" | "concise";
  forceWebSearch?: boolean;
  additionalInstruction?: string;
}

interface AssistantMessageProps {
  message: UIMessage;
  state: {
    isLastMessage: boolean;
    isStreaming: boolean;
    showActions: boolean;
    isSubmitBlocked: boolean;
  };
  projectId?: string | null;
  requestBody: RequestBody;
  onRegenerate: (options?: { body?: RequestBody; messageId?: string }) => void;
  availableModels: ModelOption[];
  onModelChange: (value: string) => void;
  onWebSearchChange: (value: boolean) => void;
  onQuestionnaireComplete: (toolCallId: string, output: QuestionnaireToolOutput) => void;
  webSearchAvailable?: boolean;
  isActive?: boolean;
  followingAssistantMessage?: UIMessage;
}

function AssistantMessage({
  message,
  state,
  projectId: _projectId,
  requestBody,
  onRegenerate,
  availableModels,
  onModelChange,
  onWebSearchChange,
  onQuestionnaireComplete,
  webSearchAvailable = true,
  isActive = true,
  followingAssistantMessage,
}: AssistantMessageProps) {
  const t = useExtracted();
  const locale = useLocale();
  const speech = useSpeechSynthesis(isActive);
  const isStreamingThis = state.isStreaming && state.isLastMessage;
  const [retryMenuOpen, setRetryMenuOpen] = useState(false);
  const [additionalInstruction, setAdditionalInstruction] = useState("");

  const regenerateMessage = (overrides?: Partial<RequestBody>) => {
    onRegenerate({
      messageId: message.id,
      body: {
        ...requestBody,
        responseStyle: "retry",
        forceWebSearch: false,
        additionalInstruction: undefined,
        ...overrides,
      },
    });
  };
  const handleAdditionalInstructionSubmit = () => {
    const instruction = additionalInstruction.trim();
    if (!instruction) {
      return;
    }
    regenerateMessage({ additionalInstruction: instruction });
    setAdditionalInstruction("");
    setRetryMenuOpen(false);
  };
  const reasoningParts =
    message.parts?.filter(
      (part) =>
        part.type === "reasoning" || part.type === "tool-search" || part.type === "tool-browse",
    ) ?? [];
  const textParts = message.parts?.filter((part) => part.type === "text") ?? [];
  const videoToolParts = message.parts?.filter(isVideoToolPart) ?? [];
  const imageToolParts = message.parts?.filter(isImageToolPart) ?? [];
  const questionnaireToolParts = message.parts?.filter(isQuestionnaireToolPart) ?? [];
  const sourceParts = message.parts?.filter((part) => part.type === "source-url") ?? [];

  if (followingAssistantMessage) {
    const followingQuestionnaireTitles = new Set(
      followingAssistantMessage.parts
        .filter(isQuestionnaireToolPart)
        .flatMap((part) => (isQuestionnaireInput(part.input) ? [part.input.title] : [])),
    );
    return (
      <AssistantMessageQuestionnaireParts
        isInteractive={false}
        onComplete={onQuestionnaireComplete}
        parts={questionnaireToolParts.filter(
          (part) =>
            part.state === "output-available" &&
            (!isQuestionnaireInput(part.input) ||
              !followingQuestionnaireTitles.has(part.input.title)),
        )}
      />
    );
  }

  return (
    <div className="space-y-2">
      <AssistantMessageChainOfThought
        messageId={message.id}
        reasoningParts={reasoningParts}
        isStreamingThis={isStreamingThis}
        hasTextParts={Boolean(message.parts?.some((p) => p.type === "text"))}
      />

      {textParts.map((part, i) => (
        <Message key={`${message.id}-text-${i}`} from={message.role}>
          <MessageContent>
            <MessageResponse>{part.text}</MessageResponse>
          </MessageContent>
          {i === textParts.length - 1 && state.showActions && (
            <MessageActions>
              <DropdownMenu
                open={retryMenuOpen}
                onOpenChange={(open) => {
                  setRetryMenuOpen(open);
                  if (!open) {
                    setAdditionalInstruction("");
                  }
                }}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={state.isSubmitBlocked}
                              aria-label={t("Retry")}
                            />
                          }
                        />
                      }
                    >
                      <RefreshCcwIcon className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t("Retry")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent align="start" className="w-64">
                  <form
                    className="flex items-center gap-2 p-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleAdditionalInstructionSubmit();
                    }}
                  >
                    <Input
                      value={additionalInstruction}
                      onChange={(event) => setAdditionalInstruction(event.target.value)}
                      placeholder={t("Refine this answer")}
                      aria-label={t("Refine this answer")}
                      className="h-7 bg-transparent! border-none! select-none! outline-none!"
                    />
                    <Button
                      type="submit"
                      size="icon-sm"
                      className="h-7"
                      disabled={state.isSubmitBlocked || additionalInstruction.trim().length === 0}
                      aria-label={t("Send")}
                    >
                      <ArrowUpIcon className="size-4" />
                    </Button>
                  </form>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => regenerateMessage()}>
                    <RefreshCcwIcon className="size-4" />
                    {t("Regenerate")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => regenerateMessage({ responseStyle: "detailed" })}
                  >
                    <ListFilterIcon className="size-4" />
                    {t("Expand answer")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => regenerateMessage({ responseStyle: "concise" })}
                  >
                    <ListFilterIcon className="size-4" />
                    {t("Shorten answer")}
                  </DropdownMenuItem>
                  {webSearchAvailable && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          onWebSearchChange(true);
                          regenerateMessage({
                            webSearch: true,
                            forceWebSearch: true,
                          });
                        }}
                      >
                        <Globe className="size-4" />
                        {t("Use web search")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          onWebSearchChange(true);
                          regenerateMessage({
                            webSearch: true,
                            deepResearch: true,
                            forceWebSearch: true,
                          });
                        }}
                      >
                        <BrainIcon className="size-4" />
                        {t("Run deep research")}
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <BrainIcon className="size-4" />
                      {t("Change model")}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto">
                      {availableModels.map((modelOption) => (
                        <DropdownMenuItem
                          key={modelOption.value}
                          onSelect={() => {
                            onModelChange(modelOption.value);
                            regenerateMessage({ model: modelOption.value });
                          }}
                        >
                          <CheckIcon
                            className={
                              modelOption.value === requestBody.model
                                ? "size-4 opacity-100"
                                : "size-4 opacity-0"
                            }
                          />
                          <span className="truncate">{modelOption.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
              {speech.supported ? (
                <MessageAction
                  onClick={() =>
                    speech.toggle(
                      `${message.id}-${i}`,
                      part.text,
                      locale === "ja" ? "ja-JP" : "en-US",
                    )
                  }
                  label={
                    speech.speakingId === `${message.id}-${i}` ? t("Stop reading") : t("Read aloud")
                  }
                  tooltip={
                    speech.speakingId === `${message.id}-${i}` ? t("Stop reading") : t("Read aloud")
                  }
                >
                  {speech.speakingId === `${message.id}-${i}` ? (
                    <SquareIcon className="size-3.5" />
                  ) : (
                    <Volume2Icon className="size-3.5" />
                  )}
                </MessageAction>
              ) : null}
              <MessageAction
                onClick={() => navigator.clipboard.writeText(part.text)}
                label={t("Copy")}
                tooltip={t("Copy")}
              >
                <CopyIcon className="size-3.5" />
              </MessageAction>
            </MessageActions>
          )}
        </Message>
      ))}

      <AssistantMessageVideoParts messageId={message.id} videoToolParts={videoToolParts} />
      <AssistantMessageImageParts messageId={message.id} imageToolParts={imageToolParts} />
      <AssistantMessageQuestionnaireParts
        isInteractive={state.isLastMessage && isActive}
        onComplete={onQuestionnaireComplete}
        parts={questionnaireToolParts}
      />
      <AssistantMessageSources messageId={message.id} sourceParts={sourceParts} />
    </div>
  );
}

const areAssistantMessagePropsEqual = (
  previous: AssistantMessageProps,
  next: AssistantMessageProps,
) =>
  previous.message === next.message &&
  previous.state.isLastMessage === next.state.isLastMessage &&
  previous.state.isStreaming === next.state.isStreaming &&
  previous.state.showActions === next.state.showActions &&
  previous.state.isSubmitBlocked === next.state.isSubmitBlocked &&
  previous.projectId === next.projectId &&
  previous.requestBody === next.requestBody &&
  previous.onRegenerate === next.onRegenerate &&
  previous.availableModels === next.availableModels &&
  previous.onModelChange === next.onModelChange &&
  previous.onWebSearchChange === next.onWebSearchChange &&
  previous.onQuestionnaireComplete === next.onQuestionnaireComplete &&
  (previous.webSearchAvailable ?? true) === (next.webSearchAvailable ?? true) &&
  previous.isActive === next.isActive &&
  previous.followingAssistantMessage === next.followingAssistantMessage;

const MemoizedAssistantMessage = memo(AssistantMessage, areAssistantMessagePropsEqual);

export { MemoizedAssistantMessage as AssistantMessage };
