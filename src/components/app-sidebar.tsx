"use client";

import { FolderClosed, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { AccountMenu } from "@/components/account-menu";
import type { ChatListItem } from "@/components/app-sidebar-chat-list";
import { normalizeTags } from "@/components/app-sidebar-utils";
import DeniAIIcon from "@/components/deni-ai-icon";
import { isCheckoutSettingsRoute } from "@/lib/settings-routes";
import { trpc } from "@/lib/trpc/react";
import { useNewChat } from "@/hooks/use-new-chat";

const AppSidebarChatList = dynamic(
  () => import("@/components/app-sidebar-chat-list").then((mod) => mod.AppSidebarChatList),
  {
    loading: () => (
      <div className="flex items-center justify-center py-8">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    ),
  },
);

const KONAMI_SEQUENCE = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
] as const;

const SIDEBAR_CUSTOM_FOLDERS_KEY = "deni-ai.sidebar.custom-folders";
const CUSTOM_FOLDERS_EVENT = "deni-ai:custom-folders";
const EMPTY_CUSTOM_FOLDERS: string[] = [];

let cachedCustomFoldersRaw: string | null | undefined;
let cachedCustomFolders: string[] = EMPTY_CUSTOM_FOLDERS;

function parseStoredCustomFolders(raw: string | null): string[] {
  if (!raw) {
    return EMPTY_CUSTOM_FOLDERS;
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return EMPTY_CUSTOM_FOLDERS;
  }

  const folders = parsed.flatMap((value) => {
    if (typeof value !== "string") {
      return [];
    }
    const folder = value.trim();
    return folder ? [folder] : [];
  });

  return folders.length > 0 ? folders : EMPTY_CUSTOM_FOLDERS;
}

function getCustomFoldersSnapshot(): string[] {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_CUSTOM_FOLDERS_KEY);
    if (raw === cachedCustomFoldersRaw) {
      return cachedCustomFolders;
    }
    cachedCustomFoldersRaw = raw;
    cachedCustomFolders = parseStoredCustomFolders(raw);
    return cachedCustomFolders;
  } catch {
    window.localStorage.removeItem(SIDEBAR_CUSTOM_FOLDERS_KEY);
    cachedCustomFoldersRaw = null;
    cachedCustomFolders = EMPTY_CUSTOM_FOLDERS;
    return EMPTY_CUSTOM_FOLDERS;
  }
}

function getServerCustomFoldersSnapshot(): string[] {
  return EMPTY_CUSTOM_FOLDERS;
}

function subscribeCustomFolders(onStoreChange: () => void) {
  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(CUSTOM_FOLDERS_EVENT, handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(CUSTOM_FOLDERS_EVENT, handleChange);
  };
}

function writeStoredCustomFolders(folders: string[]) {
  const raw = JSON.stringify(folders);
  window.localStorage.setItem(SIDEBAR_CUSTOM_FOLDERS_KEY, raw);
  cachedCustomFoldersRaw = raw;
  cachedCustomFolders = folders;
  window.dispatchEvent(new Event(CUSTOM_FOLDERS_EVENT));
}

function updateCustomFolders(updater: (current: string[]) => string[]) {
  const current = getCustomFoldersSnapshot();
  const nextFolders = updater(current);
  if (nextFolders === current) {
    return;
  }
  writeStoredCustomFolders(nextFolders);
}

export function AppSidebar({ onOpenChatSearch }: { onOpenChatSearch: () => void }) {
  const t = useExtracted();
  const { push } = useRouter();
  const pathname = usePathname();
  const isCheckoutRoute = isCheckoutSettingsRoute(pathname);
  const utils = trpc.useUtils();
  const startNewChat = useNewChat();
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const customFolders = useSyncExternalStore(
    subscribeCustomFolders,
    getCustomFoldersSnapshot,
    getServerCustomFoldersSnapshot,
  );
  const konamiIndexRef = useRef(0);
  const { isLoading, error, data } = trpc.chat.getChats.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const chats: ChatListItem[] = (data ?? []).map((item) => ({
    ...item,
    pinned: Boolean(item.pinned),
    folder: item.folder?.trim() || null,
    tags: normalizeTags(item.tags),
  }));

  const activeChatId = pathname?.startsWith("/chat/") ? pathname.slice("/chat/".length) : null;

  // Sidebar "new chat" button — navigate immediately; chat page upserts the row.
  const handleNewChat = () => {
    startNewChat();
  };

  const deleteAllChats = trpc.chat.deleteAllChats.useMutation({
    onSuccess: async () => {
      await utils.chat.getChats.invalidate();
      setIsDeleteAllDialogOpen(false);
      if (pathname?.startsWith("/chat/")) {
        push("/chat");
      }
      toast.success(t("All conversations have been deleted."));
    },
    onError: (mutationError) => {
      console.error("Failed to delete all chats", mutationError);
      toast.error(t("Failed to delete conversations. Please try again."));
    },
  });

  useEffect(() => {
    if (isCheckoutRoute) {
      konamiIndexRef.current = 0;
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isDeleteAllDialogOpen) {
        return;
      }

      const key = event.key.toLowerCase();
      const expectedKey = KONAMI_SEQUENCE[konamiIndexRef.current];

      if (key === expectedKey) {
        konamiIndexRef.current += 1;
        if (konamiIndexRef.current === KONAMI_SEQUENCE.length) {
          konamiIndexRef.current = 0;
          setIsDeleteAllDialogOpen(true);
        }
        return;
      }

      konamiIndexRef.current = key === KONAMI_SEQUENCE[0] ? 1 : 0;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCheckoutRoute, isDeleteAllDialogOpen]);

  if (isCheckoutRoute) {
    return null;
  }

  const handleDeleteAllChats = () => {
    if (deleteAllChats.isPending) {
      return;
    }

    deleteAllChats.mutate();
  };

  const handleCreateFolder = () => {
    const normalizedFolder = newFolderName.trim();
    if (!normalizedFolder) {
      return;
    }

    const existingFolders = new Set(
      [...customFolders, ...chats.flatMap((item) => (item.folder ? [item.folder] : []))].map(
        (folder) => folder.toLowerCase(),
      ),
    );

    updateCustomFolders((current) => {
      if (existingFolders.has(normalizedFolder.toLowerCase())) {
        return current;
      }

      return [...current, normalizedFolder];
    });
    setNewFolderName("");
    setIsCreateFolderOpen(false);
  };

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <div className="mb-4 flex items-center justify-between">
            <Link href="/chat" className="flex items-center gap-2">
              <DeniAIIcon className="size-7 text-sidebar-foreground" />
              <h1 className="text-base font-semibold tracking-tight text-sidebar-foreground">
                {t("Deni AI")}
              </h1>
            </Link>
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              <SidebarMenuItem>
                <Button
                  className="group/newchat h-9 w-full justify-start gap-2 rounded-t-lg rounded-b-none font-medium"
                  onClick={handleNewChat}
                >
                  <Plus className="size-4" />
                  {t("New Chat")}
                  <Kbd className="ml-auto opacity-0 transition-opacity duration-150 group-hover/newchat:opacity-100 bg-sidebar text-sidebar-foreground/80">
                    Ctrl+N
                  </Kbd>
                </Button>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Button
                  className="group/search h-9 w-full justify-start gap-2 rounded-none font-medium"
                  onClick={onOpenChatSearch}
                  variant="outline"
                >
                  <MessageSquare className="size-4" />
                  <span>{t("Chat Search")}</span>
                  <Kbd className="ml-auto opacity-0 transition-opacity duration-150 group-hover/search:opacity-100 bg-sidebar text-sidebar-foreground/80">
                    Ctrl+K
                  </Kbd>
                </Button>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Button
                  className="h-9 w-full justify-start gap-2 rounded-t-none rounded-b-lg font-medium"
                  variant="outline"
                  render={<Link href="/settings/projects" />}
                  nativeButton={false}
                >
                  <FolderClosed className="size-4" />
                  <span>{t("Projects")}</span>
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <AppSidebarChatList
          isLoading={isLoading}
          errorMessage={error?.message ?? null}
          chats={chats}
          customFolders={customFolders}
          activeChatId={activeChatId}
          onRequestCreateFolder={() => setIsCreateFolderOpen(true)}
        />

        <SidebarGroup className="mt-auto w-full border-t border-sidebar-border pt-4">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <AccountMenu />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <AlertDialog
        open={isDeleteAllDialogOpen}
        onOpenChange={(open) => {
          if (deleteAllChats.isPending) return;
          setIsDeleteAllDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete all conversations with Deni AI?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "This will permanently remove every chat in your history. This action cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAllChats.isPending}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAllChats.isPending}
              onClick={handleDeleteAllChats}
            >
              {deleteAllChats.isPending ? <Spinner /> : null}
              {t("Delete all chats")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("New Folder")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div className="text-sm font-medium">{t("Folder name")}</div>
            <Input
              aria-label={t("Folder name")}
              autoComplete="off"
              name="new-folder-name"
              placeholder={t("e.g. Work")}
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  handleCreateFolder();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={handleCreateFolder}>{t("Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
