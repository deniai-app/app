"use client";

import { useChat } from "@ai-sdk/react";
import { sendGAEvent } from "@next/third-parties/google";
import type { FileUIPart, UIMessage } from "ai";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import dynamic from "next/dynamic";
import { useExtracted } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import { ArtifactPreviewProvider } from "@/components/chat/artifact-preview-context";
import { ChatComposer, type ComposerMessage } from "@/components/chat/chat-composer";
import { ChatInterfaceHeader } from "@/components/chat/chat-interface-header";
import { ChatInterfaceMessages } from "@/components/chat/chat-interface-messages";
import { UsageAlerts } from "@/components/chat/usage-alerts";
import { useAvailableModels } from "@/hooks/use-available-models";
import { useChatPageSync } from "@/hooks/use-chat-page-sync";
import { useInitialMessage } from "@/hooks/use-initial-message";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { useChatBranches } from "@/hooks/use-chat-branches";
import { useMemorySaveNotice } from "@/hooks/use-memory-save-notice";
import { useNewChat } from "@/hooks/use-new-chat";
import { useUsageStatus } from "@/hooks/use-usage-status";
import { authClient } from "@/lib/auth-client";
import { CHAT_OLDER_MESSAGE_COUNT, mergeMessageWindow } from "@/lib/chat-messages";
import type { QuestionnaireToolOutput } from "@/lib/chat-tools/questionnaire";
import {
  defaultModel,
  GA_ID,
  getPreferredReasoningEffort,
  type ReasoningEffort,
} from "@/lib/constants";
import { trpc } from "@/lib/trpc/react";

const ArtifactPreviewPanel = dynamic(
  () => import("@/components/chat/artifact-preview-panel").then((mod) => mod.ArtifactPreviewPanel),
  { ssr: false },
);

interface ChatInterfaceProps {
  id: string;
  initialMessages?: UIMessage[];
  initialHasMore?: boolean;
  initialOldestIndex?: number;
  initialTitle?: string | null;
  initialProjectId?: string | null;
  initialProjectName?: string | null;
  initialProjectDefaultModel?: string | null;
  isActive?: boolean;
}

type UploadableFileUIPart = FileUIPart & { file?: File };
type PendingMessageMetadata = {
  pending?: boolean;
  [key: string]: unknown;
};

async function uploadAttachment(file: UploadableFileUIPart): Promise<FileUIPart> {
  if (!file.url || !file.file) {
    return file;
  }

  if (
    file.url.startsWith("https://") ||
    file.url.startsWith("http://") ||
    file.url.startsWith("data:")
  ) {
    return file;
  }

  const formData = new FormData();
  formData.set("file", file.file);

  const uploadResponse = await fetch("/api/upload-attachment", {
    method: "POST",
    body: formData,
  });

  const payload = (await uploadResponse.json().catch(() => ({}))) as {
    error?: string;
    mediaType?: string;
    url?: string;
  };
  if (!uploadResponse.ok || !payload.url) {
    throw new Error(payload.error || "Attachment upload failed.");
  }

  return {
    ...file,
    url: payload.url,
    ...(payload.mediaType ? { mediaType: payload.mediaType } : {}),
  };
}

async function normalizeAttachments(files?: UploadableFileUIPart[]) {
  if (!files?.length) {
    return undefined;
  }

  const normalized = await Promise.all(
    files.map(async (file) => {
      if (!file.url) {
        return file;
      }

      if (file.url.startsWith("https://") || file.url.startsWith("http://")) {
        return file;
      }

      return uploadAttachment(file);
    }),
  );

  return normalized;
}

function getMessageRenderKeys(messages: UIMessage[]) {
  const occurrences = new Map<string, number>();

  return messages.map((message, index) => {
    const baseKey =
      typeof message.id === "string" && message.id.trim().length > 0
        ? message.id.trim()
        : `message-${index}`;
    const duplicateCount = occurrences.get(baseKey) ?? 0;

    occurrences.set(baseKey, duplicateCount + 1);

    return duplicateCount === 0 ? baseKey : `${baseKey}-${duplicateCount}`;
  });
}

function isPendingMessage(message: UIMessage | undefined) {
  if (!message || message.role !== "assistant") {
    return false;
  }

  return Boolean((message.metadata as PendingMessageMetadata | undefined)?.pending);
}

function handleFocusComposer() {
  window.dispatchEvent(new CustomEvent("deni:focus-composer"));
}

function shouldResumeQuestionnaire({ messages }: { messages: UIMessage[] }) {
  const lastMessage = messages.at(-1);
  return (
    lastAssistantMessageIsCompleteWithToolCalls({ messages }) &&
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (part) => part.type === "tool-questionnaire" && part.state === "output-available",
    )
  );
}

async function submitComposerMessage(params: {
  message: ComposerMessage;
  options: {
    model: string;
    webSearch: boolean;
    reasoningEffort: ReasoningEffort;
    proMode: boolean;
    fastMode: boolean;
    deepResearch: boolean;
  };
  id: string;
  isSubmitBlocked: boolean;
  usageTier: string;
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  invalidateChats: () => void;
  setAttachmentError: (error: string | null) => void;
  setInput: (value: string) => void;
  localizeError: (error: unknown, fallback?: string) => string;
  uploadFailedLabel: string;
}) {
  if (params.isSubmitBlocked) {
    return;
  }
  params.setAttachmentError(null);

  let attachments: FileUIPart[] | undefined;
  try {
    attachments = await normalizeAttachments(params.message.files);
  } catch (error) {
    params.setAttachmentError(params.localizeError(error, params.uploadFailedLabel));
    return;
  }

  if (params.message.text || attachments?.length) {
    if (GA_ID) {
      sendGAEvent("event", "chat_message_sent", {
        event_category: "chat",
        event_label: params.usageTier,
        value: 1,
      });
    }

    Promise.resolve(
      params.sendMessage(
        {
          text: params.message.text || "",
          files: attachments,
        },
        {
          body: {
            model: params.options.model,
            webSearch: params.options.webSearch,
            reasoningEffort: params.options.reasoningEffort,
            proMode: params.options.proMode,
            fastMode: params.options.fastMode,
            deepResearch: params.options.deepResearch,
            id: params.id,
          },
        },
      ),
    ).finally(() => {
      params.invalidateChats();
    });
    params.setInput("");
  }
}

export function ChatInterface({
  id,
  initialMessages = [],
  initialHasMore = false,
  initialOldestIndex = 0,
  initialTitle = null,
  initialProjectId = null,
  initialProjectName = null,
  initialProjectDefaultModel = null,
  isActive = true,
}: ChatInterfaceProps) {
  const t = useExtracted();
  const session = authClient.useSession();
  const isAnonymous = Boolean(session.data?.user?.isAnonymous);
  const [input, setInput] = useState("");
  const [modelOverride, setModel] = useState<string | null>(null);
  const [webSearchOverride, setWebSearch] = useState<boolean | null>(null);
  const [reasoningEffortOverride, setReasoningEffort] = useState<ReasoningEffort | null>(null);
  const [proModeOverride, setProMode] = useState<boolean | null>(null);
  const [fastModeOverride, setFastMode] = useState<boolean | null>(null);
  const [deepResearchOverride, setDeepResearch] = useState<boolean | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const localizeError = useLocalizeError();
  const utils = trpc.useUtils();
  const { availableModels, platformCapabilities } = useAvailableModels();
  const { features } = platformCapabilities;
  const billingDisabled = !features.billing;
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        body: {
          id,
        },
      }),
    [id],
  );

  const { messages, sendMessage, regenerate, setMessages, addToolOutput, status, error, stop } =
    useChat({
      id,
      messages: initialMessages,
      sendAutomaticallyWhen: shouldResumeQuestionnaire,
      transport,
    });

  const oldestIndexRef = useRef(initialOldestIndex);
  const hasMoreRef = useRef(initialHasMore);
  const isLoadingOlderRef = useRef(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const loadOlderMessages = useCallback(async () => {
    if (!hasMoreRef.current || isLoadingOlderRef.current || oldestIndexRef.current <= 0) {
      return;
    }

    isLoadingOlderRef.current = true;
    setIsLoadingOlder(true);
    try {
      const page = await utils.chat.getOlderMessages.fetch({
        id,
        beforeIndex: oldestIndexRef.current,
        limit: CHAT_OLDER_MESSAGE_COUNT,
      });
      oldestIndexRef.current = page.oldestIndex;
      hasMoreRef.current = page.hasMore;
      setHasMore(page.hasMore);
      setMessages((current) => mergeMessageWindow(page.messages as UIMessage[], current));
    } finally {
      isLoadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [id, setMessages, utils.chat.getOlderMessages]);

  const projectDefaultModel =
    initialProjectDefaultModel &&
    availableModels.some((entry) => entry.value === initialProjectDefaultModel)
      ? initialProjectDefaultModel
      : null;
  const fallbackModel = availableModels.some((entry) => entry.value === defaultModel.value)
    ? defaultModel.value
    : (availableModels[0]?.value ?? defaultModel.value);
  const availableModelValues = useMemo(
    () =>
      availableModels.length > 0 ? new Set(availableModels.map((entry) => entry.value)) : undefined,
    [availableModels],
  );

  const seed = useInitialMessage({
    id,
    initialMessagesLength: initialMessages.length,
    model: modelOverride ?? projectDefaultModel ?? fallbackModel,
    availableModelValues,
    sendMessage,
    onMessageSent: () => {
      void utils.chat.getChats.invalidate();
    },
    onDraft: setInput,
  });

  const model = modelOverride ?? seed?.model ?? projectDefaultModel ?? fallbackModel;
  const webSearch = features.webSearch && (webSearchOverride ?? seed?.webSearch ?? false);
  const reasoningEffort =
    reasoningEffortOverride ??
    seed?.reasoningEffort ??
    getPreferredReasoningEffort(defaultModel.efforts);
  const proMode =
    Boolean(availableModels.find((entry) => entry.value === model)?.supportsProMode) &&
    (proModeOverride ?? seed?.proMode ?? false);
  const fastMode = fastModeOverride ?? seed?.fastMode ?? false;
  const deepResearch = features.webSearch && (deepResearchOverride ?? seed?.deepResearch ?? false);

  const {
    usageQuery,
    selectedModel,
    usageTier,
    isUsageLow,
    isUsageBlocked,
    canEnableMaxMode,
    isSubmitBlocked,
    usageCategoryLabel,
    usageTierLabel,
    remainingUsage,
    usageUnitLabel,
    enableMaxMode,
  } = useUsageStatus({ model, availableModels, proMode });

  const requestBody = useMemo(
    () => ({
      model,
      webSearch,
      reasoningEffort,
      proMode,
      fastMode,
      deepResearch,
      id,
    }),
    [model, webSearch, reasoningEffort, proMode, fastMode, deepResearch, id],
  );

  const { handleRegenerate, groupedMessages } = useChatBranches({
    messages,
    setMessages,
    regenerate,
  });
  const hasPendingQuestionnaire = messages.some((message) =>
    message.parts.some(
      (part) =>
        part.type === "tool-questionnaire" &&
        (part.state === "input-streaming" || part.state === "input-available"),
    ),
  );
  const handleQuestionnaireComplete = useCallback(
    (toolCallId: string, output: QuestionnaireToolOutput) => {
      addToolOutput({
        tool: "questionnaire",
        toolCallId,
        output,
        options: { body: requestBody },
      });
    },
    [addToolOutput, requestBody],
  );
  const showMessageActions = status !== "streaming" && status !== "submitted";
  const lastMessage = messages.at(-1);
  const isWaitingForResponse =
    status !== "streaming" && status !== "submitted" && isPendingMessage(lastMessage);
  const chatStatusQuery = trpc.chat.getChatStatus.useQuery(
    { id },
    {
      enabled: isWaitingForResponse,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnReconnect: true,
      refetchIntervalInBackground: true,
      refetchInterval: isWaitingForResponse ? 1000 : false,
    },
  );

  useChatPageSync({
    id,
    status,
    isWaitingForResponse,
    activeGenerationId: chatStatusQuery.data?.activeGenerationId,
    statusUpdatedAt: chatStatusQuery.data?.updated_at,
    isStatusSuccess: chatStatusQuery.isSuccess,
    setMessages,
  });

  useMemorySaveNotice({ status, enabled: features.memory });

  const handleSubmit = (
    message: ComposerMessage,
    options: {
      model: string;
      webSearch: boolean;
      reasoningEffort: ReasoningEffort;
      proMode: boolean;
      fastMode: boolean;
      deepResearch: boolean;
    },
  ) =>
    submitComposerMessage({
      message,
      options,
      id,
      isSubmitBlocked: isSubmitBlocked || hasPendingQuestionnaire,
      usageTier,
      sendMessage,
      invalidateChats: () => {
        void utils.chat.getChats.invalidate();
      },
      setAttachmentError,
      setInput,
      localizeError,
      uploadFailedLabel: t("Failed to upload attachment."),
    });

  // Adjust invalid model during render (avoids setState-in-effect cascade).
  if (!selectedModel && availableModels.length > 0) {
    setModel(fallbackModel);
  }

  const handleStop = useCallback(() => {
    stop();

    void fetch("/api/chat/stop", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });
  }, [id, stop]);

  const messageRenderKeys = useMemo(() => getMessageRenderKeys(messages), [messages]);
  const messageIndexMap = useMemo(() => {
    const indexMap = new Map<UIMessage, number>();
    for (let i = 0; i < messages.length; i++) {
      indexMap.set(messages[i], i);
    }
    return indexMap;
  }, [messages]);

  const startNewChat = useNewChat();
  const handleNewChat = useCallback(() => startNewChat(), [startNewChat]);
  const handleModelChange = useCallback(
    (value: string) => {
      setModel(value);
      const nextModel = availableModels.find((entry) => entry.value === value);
      const nextEfforts = nextModel?.efforts;
      if (!nextModel?.supportsProMode) {
        setProMode(false);
      }
      if (!nextModel?.supportsFastMode) {
        setFastMode(false);
      }
      if (!nextEfforts) {
        return;
      }
      setReasoningEffort((current) =>
        current && nextEfforts.includes(current)
          ? current
          : getPreferredReasoningEffort(nextEfforts),
      );
    },
    [availableModels],
  );
  const handleWebSearchChange = useCallback(
    (enabled: boolean) => setWebSearch(enabled && features.webSearch),
    [features.webSearch],
  );

  useKeyboardShortcuts({
    enabled: isActive,
    onFocusComposer: handleFocusComposer,
    onNewChat: handleNewChat,
  });

  return (
    <ArtifactPreviewProvider>
      <ArtifactPreviewPanel />
      <div className="flex h-full flex-1 min-h-0 flex-col w-full max-w-3xl mx-auto p-4 overflow-hidden">
        <ChatInterfaceHeader
          chatId={id}
          messages={messages}
          initialTitle={initialTitle}
          initialProjectId={initialProjectId}
          initialProjectName={initialProjectName}
        />
        <ChatInterfaceMessages
          messages={messages}
          groupedMessages={groupedMessages}
          messageRenderKeys={messageRenderKeys}
          messageIndexMap={messageIndexMap}
          status={status}
          showMessageActions={showMessageActions}
          isSubmitBlocked={isSubmitBlocked || hasPendingQuestionnaire}
          isWaitingForResponse={isWaitingForResponse}
          sessionUserId={session.data?.session?.userId}
          isAnonymous={isAnonymous}
          usageTier={usageQuery.data?.tier ?? null}
          error={error}
          attachmentError={attachmentError}
          initialProjectId={initialProjectId}
          requestBody={requestBody}
          onRegenerate={handleRegenerate}
          availableModels={availableModels}
          onModelChange={handleModelChange}
          onWebSearchChange={handleWebSearchChange}
          onQuestionnaireComplete={handleQuestionnaireComplete}
          webSearchAvailable={features.webSearch}
          isActive={isActive}
          hasMore={hasMore}
          isLoadingOlder={isLoadingOlder}
          onLoadOlder={
            status === "streaming" || status === "submitted" ? undefined : loadOlderMessages
          }
        />

        <UsageAlerts
          status={{
            isAnonymous,
            isUsageLow,
            isUsageBlocked,
            canEnableMaxMode,
            billingDisabled,
          }}
          usage={{
            remaining: remainingUsage,
            unitLabel: usageUnitLabel,
            categoryLabel: usageCategoryLabel,
            tierLabel: usageTierLabel,
          }}
          enableMaxMode={enableMaxMode}
          onRefreshUsage={() => usageQuery.refetch()}
        />

        <ChatComposer
          className="mt-4"
          globalDrop={isActive}
          value={input}
          onValueChange={setInput}
          onSubmit={handleSubmit}
          onStop={handleStop}
          status={status}
          isSubmitDisabled={isSubmitBlocked || hasPendingQuestionnaire}
          availableModels={availableModels}
          model={model}
          onModelChange={handleModelChange}
          webSearch={webSearch}
          onWebSearchChange={(enabled) => setWebSearch(enabled && features.webSearch)}
          webSearchAvailable={features.webSearch}
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={setReasoningEffort}
          proMode={proMode}
          onProModeChange={setProMode}
          fastMode={fastMode}
          onFastModeChange={setFastMode}
          deepResearch={deepResearch}
          onDeepResearchChange={setDeepResearch}
        />
      </div>
    </ArtifactPreviewProvider>
  );
}
