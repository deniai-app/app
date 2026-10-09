import type { ChatStatus, UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { mergeServerWindow } from "@/lib/chat-messages";
import { trpc } from "@/lib/trpc/react";

export function useChatPageSync(params: {
  id: string;
  status: ChatStatus;
  isWaitingForResponse: boolean;
  activeGenerationId: string | null | undefined;
  statusUpdatedAt: Date | null | undefined;
  isStatusSuccess: boolean;
  setMessages: (messages: UIMessage[] | ((current: UIMessage[]) => UIMessage[])) => void;
}) {
  const {
    id,
    status,
    isWaitingForResponse,
    activeGenerationId,
    statusUpdatedAt,
    isStatusSuccess,
    setMessages,
  } = params;
  const utils = trpc.useUtils();
  const lastRecoveredStatusRef = useRef<number | null>(null);
  const previousStatusRef = useRef(status);

  useEffect(() => {
    const recoveredAt = statusUpdatedAt?.getTime() ?? null;

    if (
      !isWaitingForResponse ||
      !isStatusSuccess ||
      activeGenerationId ||
      recoveredAt === null ||
      lastRecoveredStatusRef.current === recoveredAt
    ) {
      return;
    }

    lastRecoveredStatusRef.current = recoveredAt;
    let cancelled = false;

    void utils.chat.getChatPage
      .fetch({ id })
      .then((chat) => {
        if (cancelled || !chat?.messages) {
          return;
        }

        const serverMessages = chat.messages as UIMessage[];

        setMessages((current) => {
          if (serverMessages.length === 0 && current.length > 0) {
            return current;
          }

          // Loaded history can be longer than the server's latest-message window.
          // Match the current turn, including windows containing only assistant
          // continuations, without replacing a newer local question with old data.
          const lastLocalMessage = current.at(-1);
          const lastLocalUser = current.findLast((message) => message.role === "user");
          if (
            lastLocalUser &&
            !serverMessages.some(
              (message) => message.id === lastLocalUser.id || message.id === lastLocalMessage?.id,
            )
          ) {
            return current;
          }

          return mergeServerWindow(current, serverMessages);
        });
      })
      .catch(() => {
        if (!cancelled) {
          lastRecoveredStatusRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeGenerationId,
    id,
    isStatusSuccess,
    isWaitingForResponse,
    setMessages,
    statusUpdatedAt,
    utils,
  ]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;

    const hadInFlightRequest = previousStatus === "submitted" || previousStatus === "streaming";
    const requestSettled = status === "ready" || status === "error";

    if (!hadInFlightRequest || !requestSettled) {
      return;
    }

    void utils.billing.usage.invalidate();
    void utils.chat.getChatPage.invalidate({ id });
  }, [id, status, utils]);
}
