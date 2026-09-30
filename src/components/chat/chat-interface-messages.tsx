"use client";

import type { ChatStatus, FileUIPart, UIMessage } from "ai";
import { useExtracted } from "next-intl";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import {
  Message,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { AdSlot } from "@/components/ad-slot";
import { AssistantMessage } from "@/components/chat/assistant-message";
import type { ModelOption } from "@/components/chat/chat-composer";
import type { GroupedMessage } from "@/hooks/use-chat-branches";
import type { ReasoningEffort } from "@/lib/constants";
import { toDisplayChatRequestError } from "@/lib/chat-request-error";
import { shouldShowChatAd } from "@/lib/chat-ad-placement";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { QuestionnaireToolOutput } from "@/lib/chat-tools/questionnaire";

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

function isFilePart(part: UIMessage["parts"][number]): part is FileUIPart {
  return part.type === "file";
}

function isTextPart(
  part: UIMessage["parts"][number],
): part is Extract<UIMessage["parts"][number], { type: "text"; text: string }> {
  return part.type === "text";
}

export interface ChatInterfaceMessagesProps {
  messages: UIMessage[];
  groupedMessages: GroupedMessage[];
  messageRenderKeys: string[];
  messageIndexMap: Map<UIMessage, number>;
  status: ChatStatus;
  showMessageActions: boolean;
  isSubmitBlocked: boolean;
  isWaitingForResponse: boolean;
  sessionUserId?: string;
  isAnonymous: boolean;
  usageTier: string | null;
  error: Error | undefined;
  attachmentError: string | null;
  initialProjectId?: string | null;
  requestBody: RequestBody;
  onRegenerate: (options?: { body?: RequestBody; messageId?: string }) => void;
  availableModels: ModelOption[];
  onModelChange: (value: string) => void;
  onWebSearchChange: (value: boolean) => void;
  onQuestionnaireComplete: (toolCallId: string, output: QuestionnaireToolOutput) => void;
  webSearchAvailable?: boolean;
  isActive?: boolean;
  hasMore?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => void | Promise<void>;
}

function ChatHistoryLoader({
  hasMore,
  isLoadingOlder,
  onLoadOlder,
  messageCount,
}: {
  hasMore: boolean;
  isLoadingOlder: boolean;
  onLoadOlder?: () => void | Promise<void>;
  messageCount: number;
}) {
  const { escapedFromLock, scrollRef } = useStickToBottomContext();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<{ height: number; top: number } | null>(null);
  const previousCountRef = useRef(messageCount);

  useLayoutEffect(() => {
    const pending = restoreRef.current;
    if (!pending || messageCount <= previousCountRef.current) {
      previousCountRef.current = messageCount;
      return;
    }
    previousCountRef.current = messageCount;
    restoreRef.current = null;
    const root = scrollRef.current;
    if (root) {
      root.scrollTop = pending.top + (root.scrollHeight - pending.height);
    }
  }, [messageCount, scrollRef]);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    // Wait until the user has scrolled away from the latest message. On
    // mount the list starts at scrollTop 0, so an immediate observer fire
    // would pull older history and then animate back down.
    if (!root || !sentinel || !hasMore || !onLoadOlder || isLoadingOlder || !escapedFromLock) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }
        restoreRef.current = { height: root.scrollHeight, top: root.scrollTop };
        void onLoadOlder();
      },
      { root, rootMargin: "160px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [escapedFromLock, hasMore, isLoadingOlder, onLoadOlder, scrollRef]);

  if (!hasMore && !isLoadingOlder) {
    return null;
  }

  return (
    <div ref={sentinelRef} className="flex justify-center py-2">
      {isLoadingOlder ? <Spinner className="size-4" /> : null}
    </div>
  );
}

export const ChatInterfaceMessages = memo(function ChatInterfaceMessages({
  messages,
  groupedMessages,
  messageRenderKeys,
  messageIndexMap,
  status,
  showMessageActions,
  isSubmitBlocked,
  isWaitingForResponse,
  sessionUserId,
  isAnonymous,
  usageTier,
  error,
  attachmentError,
  initialProjectId,
  requestBody,
  onRegenerate,
  availableModels,
  onModelChange,
  onWebSearchChange,
  onQuestionnaireComplete,
  webSearchAvailable = true,
  isActive = true,
  hasMore = false,
  isLoadingOlder = false,
  onLoadOlder,
}: ChatInterfaceMessagesProps) {
  const t = useExtracted();
  const [lastAd, setLastAd] = useState<{ chatId: string; id: string } | null>(null);
  const rememberAd = useCallback(
    (id: string) => setLastAd({ chatId: requestBody.id, id }),
    [requestBody.id],
  );
  const latestMessage = messages.at(-1);
  const showAd = shouldShowChatAd({
    status,
    lastMessage: latestMessage,
    isWaitingForResponse,
    hasError: Boolean(error),
  });
  const adViewerId = sessionUserId;
  const canRequestAd =
    Boolean(adViewerId) && (isAnonymous || usageTier === null || usageTier === "free");

  return (
    <Conversation className="flex-1 min-h-0 h-full">
      <ConversationContent>
        <ChatHistoryLoader
          hasMore={hasMore}
          isLoadingOlder={isLoadingOlder}
          onLoadOlder={onLoadOlder}
          messageCount={messages.length}
        />
        {groupedMessages.map((group, groupIndex) => {
          if (group.type === "single") {
            const message = group.message;
            const msgIndex = messageIndexMap.get(message) ?? -1;
            const renderKey = messageRenderKeys[msgIndex] ?? `group-${groupIndex}`;
            const fileParts = message.parts.filter(isFilePart);
            const textParts = message.parts.filter(isTextPart);
            // The SDK starts a new assistant message after a questionnaire reply.
            // Hide the prior reasoning; keep only completed forms not repeated in the continuation.
            const nextMessage = messages[msgIndex + 1];
            const followingAssistantMessage =
              message.role === "assistant" &&
              message.parts.some(
                (part) => part.type === "tool-questionnaire" && part.state === "output-available",
              ) &&
              nextMessage?.role === "assistant"
                ? nextMessage
                : undefined;
            return (
              <div className="chat-message-group" key={renderKey}>
                {message.role === "user" && (
                  <Message from="user">
                    <MessageContent>
                      {fileParts.length > 0 ? (
                        <Attachments variant="list" className="w-full">
                          {fileParts.map((part, partIndex) => (
                            <Attachment
                              data={{ ...part, id: `${message.id}-file-${partIndex}` }}
                              key={`${message.id}-file-${partIndex}`}
                              className="w-full bg-background/50"
                            >
                              <AttachmentPreview />
                              <AttachmentInfo showMediaType />
                            </Attachment>
                          ))}
                        </Attachments>
                      ) : null}
                      {textParts.map((part, partIndex) => (
                        <MessageResponse key={`${message.id}-text-${partIndex}`}>
                          {part.text}
                        </MessageResponse>
                      ))}
                    </MessageContent>
                  </Message>
                )}
                {message.role === "assistant" && (
                  <AssistantMessage
                    message={message}
                    followingAssistantMessage={followingAssistantMessage}
                    state={{
                      isLastMessage: msgIndex === messages.length - 1,
                      isStreaming: status === "streaming",
                      showActions: showMessageActions,
                      isSubmitBlocked,
                    }}
                    projectId={initialProjectId}
                    requestBody={requestBody}
                    onRegenerate={onRegenerate}
                    availableModels={availableModels}
                    onModelChange={onModelChange}
                    onWebSearchChange={onWebSearchChange}
                    onQuestionnaireComplete={onQuestionnaireComplete}
                    webSearchAvailable={webSearchAvailable}
                    isActive={isActive}
                  />
                )}
              </div>
            );
          }

          const lastBranchIndex =
            messageIndexMap.get(group.messages[group.messages.length - 1]) ?? -1;
          return (
            <MessageBranch
              className="chat-message-group"
              key={`branch-${group.groupId}`}
              defaultBranch={group.messages.length - 1}
            >
              <MessageBranchSelector>
                <MessageBranchPrevious />
                <MessageBranchPage />
                <MessageBranchNext />
              </MessageBranchSelector>
              <MessageBranchContent>
                {group.messages.map((message, branchIdx) => (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    state={{
                      isLastMessage:
                        branchIdx === group.messages.length - 1 &&
                        lastBranchIndex === messages.length - 1,
                      isStreaming: status === "streaming",
                      showActions: showMessageActions,
                      isSubmitBlocked,
                    }}
                    projectId={initialProjectId}
                    requestBody={requestBody}
                    onRegenerate={onRegenerate}
                    availableModels={availableModels}
                    onModelChange={onModelChange}
                    onWebSearchChange={onWebSearchChange}
                    onQuestionnaireComplete={onQuestionnaireComplete}
                    webSearchAvailable={webSearchAvailable}
                    isActive={isActive}
                  />
                ))}
              </MessageBranchContent>
            </MessageBranch>
          );
        })}
        {messages.length > 0 && canRequestAd && adViewerId && (
          <AdSlot
            className="mx-auto w-full max-w-xl"
            viewerId={adViewerId}
            chatId={requestBody.id}
            visible={showAd}
            requestInFlight={status === "submitted" || status === "streaming"}
            excludeId={lastAd?.chatId === requestBody.id ? lastAd.id : null}
            onAdSelected={rememberAd}
          />
        )}
        {status === "submitted" && (
          <div className="min-h-6">
            <Loader />
          </div>
        )}

        {isWaitingForResponse && (
          <Card className="!gap-0 bg-muted/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader />
                <span>{t("Waiting for response...")}</span>
              </CardTitle>
            </CardHeader>
          </Card>
        )}

        {error && (
          <Card className="!gap-0 bg-destructive/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>{t("Error")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm break-words">
                {toDisplayChatRequestError(error, t("An unexpected error occurred."))}
              </div>
            </CardContent>
          </Card>
        )}

        {attachmentError && (
          <Card className="!gap-0 bg-destructive/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>{t("Error")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm break-words">{attachmentError}</div>
            </CardContent>
          </Card>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
});
