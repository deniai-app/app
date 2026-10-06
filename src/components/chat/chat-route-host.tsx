"use client";

import type { UIMessage } from "ai";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ChatInterfaceSkeleton } from "@/components/chat/chat-interface-skeleton";
import { DocumentTitle } from "@/components/document-title";
import { trpc } from "@/lib/trpc/react";

/**
 * SPA-style chat host (chat-js ChatRouteHost pattern).
 *
 * /chat and /chat/[id] pages render null so Next route transitions only swap a
 * thin segment. This host stays mounted in the app shell, keeps recently
 * visited chat panes alive, and loads message data via tRPC (prefetchable on
 * sidebar hover). Instant Navigations (cacheComponents + partialPrefetching)
 * make the route shell free; this host makes chat-to-chat feel like an SPA.
 */

const ChatHome = dynamic(() => import("@/components/chat/home"), {
  loading: () => <ChatInterfaceSkeleton />,
});

const ChatInterface = dynamic(
  () => import("@/components/chat/chat-interface").then((mod) => mod.ChatInterface),
  { loading: () => <ChatInterfaceSkeleton /> },
);

const MAX_MOUNTED_CHATS = 5;

function ChatDocumentTitle({
  chatId,
  fallbackTitle,
}: {
  chatId: string;
  fallbackTitle?: string | null;
}) {
  const { data } = trpc.chat.getChats.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const listTitle = data?.find((chat) => chat.id === chatId)?.title;
  const title = (listTitle ?? fallbackTitle)?.trim() || "New Chat";

  return <DocumentTitle title={title} />;
}

function parseChatRoute(pathname: string): { kind: "home" } | { kind: "chat"; id: string } | null {
  if (pathname === "/chat") {
    return { kind: "home" };
  }
  const match = /^\/chat\/([^/]+)$/.exec(pathname);
  if (!match) {
    return null;
  }
  return { kind: "chat", id: match[1] };
}

function nextMountedIds(prev: string[], activeId: string): string[] {
  if (prev.includes(activeId) && prev[prev.length - 1] === activeId) {
    return prev;
  }
  const without = prev.filter((entry) => entry !== activeId);
  const next = [...without, activeId];
  if (next.length <= MAX_MOUNTED_CHATS) {
    return next;
  }
  const droppable = next.slice(0, -1);
  const keep = droppable.slice(-(MAX_MOUNTED_CHATS - 1));
  return [...keep, activeId];
}

function useChatPanePage(id: string, isActive: boolean, projectIdFromQuery: string | null) {
  const utils = trpc.useUtils();

  const pageQuery = trpc.chat.getChatPage.useQuery(
    { id },
    {
      staleTime: 30_000,
      refetchOnWindowFocus: isActive,
      refetchOnReconnect: isActive,
    },
  );

  const shouldEnsure = isActive && pageQuery.isSuccess && pageQuery.data === null;
  const paneIdRef = useRef(id);
  const projectIdRef = useRef(projectIdFromQuery);

  useEffect(() => {
    paneIdRef.current = id;
    projectIdRef.current = projectIdFromQuery;
  });

  // `mutate` is stable; the full mutation result changes identity on every
  // status update, which re-ran the effect below and flooded ensureChat.
  const { mutate: ensureChat } = trpc.chat.ensureChat.useMutation({
    retry: false,
    onSuccess: (row, variables) => {
      if (
        variables.id !== paneIdRef.current ||
        (variables.projectId ?? null) !== projectIdRef.current
      ) {
        return;
      }
      utils.chat.getChatPage.setData({ id: variables.id }, row);
      void utils.chat.getChats.invalidate();
      if (variables.projectId) {
        window.history.replaceState({}, "", `/chat/${variables.id}`);
      }
    },
    onError: (_error, variables) => {
      if (
        variables.id !== paneIdRef.current ||
        (variables.projectId ?? null) !== projectIdRef.current
      ) {
        return;
      }
      if (!utils.chat.getChatPage.getData({ id: variables.id })) {
        window.location.replace("/chat");
      }
    },
  });

  // Request each (chat, project) pair once per pane, even if the effect re-runs.
  const ensuredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!shouldEnsure) {
      return;
    }
    const key = `${id}:${projectIdFromQuery ?? ""}`;
    if (ensuredKeyRef.current === key) {
      return;
    }
    ensuredKeyRef.current = key;
    ensureChat({ id, projectId: projectIdFromQuery });
  }, [ensureChat, id, projectIdFromQuery, shouldEnsure]);

  return pageQuery.data ?? null;
}

function ChatPane({ id, isActive }: { id: string; isActive: boolean }) {
  const searchParams = useSearchParams();
  const projectIdFromQuery = searchParams.get("projectId");
  const page = useChatPanePage(id, isActive, projectIdFromQuery);

  return (
    <div className="-m-4 flex min-h-0 flex-1 overflow-hidden">
      {isActive ? <ChatDocumentTitle chatId={id} fallbackTitle={page?.title} /> : null}
      {page ? (
        <ChatInterface
          id={id}
          isActive={isActive}
          initialMessages={page.messages as UIMessage[]}
          initialHasMore={page.hasMore}
          initialOldestIndex={page.oldestIndex}
          initialTitle={page.title}
          initialProjectId={page.projectId}
          initialProjectName={page.projectName ?? null}
          initialProjectDefaultModel={page.projectDefaultModel ?? null}
        />
      ) : (
        <ChatInterfaceSkeleton />
      )}
    </div>
  );
}

function ChatPanes({ activeId }: { activeId: string }) {
  const [mountedIds, setMountedIds] = useState<string[]>([activeId]);
  const nextIds = nextMountedIds(mountedIds, activeId);
  if (nextIds !== mountedIds) {
    setMountedIds(nextIds);
  }

  return (
    <>
      {nextIds.map((id) => {
        const isActive = id === activeId;
        return (
          <div
            key={id}
            className={isActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}
            aria-hidden={!isActive}
          >
            <Suspense fallback={<ChatInterfaceSkeleton />}>
              <ChatPane id={id} isActive={isActive} />
            </Suspense>
          </div>
        );
      })}
    </>
  );
}

function ChatRouteHostInner() {
  const pathname = usePathname();
  const route = parseChatRoute(pathname);

  if (!route) {
    return null;
  }

  if (route.kind === "home") {
    return (
      <div className="-m-4 flex min-h-0 flex-1 overflow-hidden">
        <DocumentTitle />
        <ChatHome />
      </div>
    );
  }

  return <ChatPanes activeId={route.id} />;
}

export function ChatRouteHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isChatRoute = parseChatRoute(pathname) !== null;

  if (!isChatRoute) {
    return children;
  }

  return (
    <>
      {/* Keep layout RequireAuth mounted so unauthenticated / expired sessions
          still redirect. The page itself is null; this slot is the auth gate. */}
      <div hidden>{children}</div>
      <Suspense fallback={<ChatInterfaceSkeleton />}>
        <ChatRouteHostInner />
      </Suspense>
    </>
  );
}
