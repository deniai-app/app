import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { captureAccountEpoch } from "@/lib/account-query-boundary";
import { makeTRPCClient } from "@/lib/trpc/client";
import { trpc } from "@/lib/trpc/react";

type NewChatOptions = {
  projectId?: string | null;
};

/**
 * Start a new chat by generating a client-side id and navigating immediately.
 * Seeds the SPA ChatRouteHost cache and sidebar list so the empty pane paints
 * with no loading flash; ensureChat persists the DB row in the background.
 */
export function useNewChat() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  return (options?: NewChatOptions): string => {
    const id = crypto.randomUUID();
    const projectId = options?.projectId ?? null;
    const now = new Date();

    utils.chat.getChats.setData(undefined, (old) => [
      {
        id,
        title: "New Chat",
        projectId,
        pinned: false,
        folder: null,
        tags: [],
        created_at: now,
        updated_at: now,
      },
      ...(old ?? []),
    ]);

    // Seed SPA host cache so the pane paints without waiting on the network.
    utils.chat.getChatPage.setData(
      { id },
      {
        id,
        title: "New Chat",
        projectId,
        projectName: null,
        projectDefaultModel: null,
        messages: [],
        oldestIndex: 0,
        hasMore: false,
      },
    );

    // Persist row ASAP so /api/chat can write on first message. A row returned
    // after the account changed must not reach the next account's cache.
    const isSameAccount = captureAccountEpoch(queryClient);
    void makeTRPCClient()
      .chat.ensureChat.mutate({ id, projectId })
      .then((row) => {
        if (isSameAccount()) utils.chat.getChatPage.setData({ id }, row);
      })
      .catch(() => {
        // ChatRouteHost will retry ensure on mount if needed.
      });

    const url = projectId
      ? `/chat/${id}?projectId=${encodeURIComponent(projectId)}`
      : `/chat/${id}`;
    router.prefetch(url);
    router.push(url);

    return id;
  };
}
