"use client";

import type { CSSProperties } from "react";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { compareDesc, isThisMonth, isThisWeek, isThisYear, isToday, isYesterday } from "date-fns";
import {
  ChevronRight,
  FolderClosed,
  FolderOpen,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { Fragment, startTransition, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { mergeFolderGroups, normalizeTags } from "@/components/app-sidebar-utils";
import { trpc } from "@/lib/trpc/react";

const DROP_ZONE_UNGROUPED = "__ungrouped__";

export type ChatRecencyBucketKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "thisMonth"
  | "thisYear"
  | "older";

export type ChatListItem = {
  id: string;
  title: string | null;
  pinned: boolean;
  folder: string | null;
  tags: string[];
  created_at: Date;
  updated_at: Date;
};

type ChatDragPayload = {
  chatId: string;
  folder: string | null;
};

type FolderGroup = {
  folder: string;
  items: ChatListItem[];
};

type ChatItemDraft = {
  title: string;
  folder: string;
  tagsInput: string;
};

function createChatItemDraft(item: ChatListItem): ChatItemDraft {
  return {
    title: item.title ?? "",
    folder: item.folder ?? "",
    tagsInput: item.tags.join(", "),
  };
}

function parseTagsInput(value: string): string[] {
  return normalizeTags(value.split(","));
}

function getRecencyBucketKey(date: Date): ChatRecencyBucketKey {
  if (isToday(date)) {
    return "today";
  }
  if (isYesterday(date)) {
    return "yesterday";
  }
  if (isThisWeek(date, { weekStartsOn: 1 })) {
    return "thisWeek";
  }
  if (isThisMonth(date)) {
    return "thisMonth";
  }
  if (isThisYear(date)) {
    return "thisYear";
  }
  return "older";
}

function groupChatsByRecency(items: ChatListItem[]) {
  const bucketOrder: ChatRecencyBucketKey[] = [
    "today",
    "yesterday",
    "thisWeek",
    "thisMonth",
    "thisYear",
    "older",
  ];
  const buckets = new Map<ChatRecencyBucketKey, ChatListItem[]>();

  for (const item of items.toSorted((a, b) => compareDesc(a.updated_at, b.updated_at))) {
    const key = getRecencyBucketKey(item.updated_at);
    const existing = buckets.get(key);

    if (existing) {
      existing.push(item);
      continue;
    }

    buckets.set(key, [item]);
  }

  return bucketOrder.flatMap((key) => {
    const bucketItems = buckets.get(key);
    if (!bucketItems?.length) {
      return [];
    }

    return [{ key, items: bucketItems }] as const;
  });
}

function groupChatsByFolder(items: ChatListItem[]) {
  const folderMap = new Map<string, ChatListItem[]>();

  for (const item of items) {
    if (!item.folder) {
      continue;
    }

    const existing = folderMap.get(item.folder);
    if (existing) {
      existing.push(item);
      continue;
    }

    folderMap.set(item.folder, [item]);
  }

  return Array.from(folderMap.entries())
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([folder, folderItems]) => ({
      folder,
      items: folderItems.toSorted((a, b) => compareDesc(a.updated_at, b.updated_at)),
    }));
}

function getChatDragId(chatId: string) {
  return `chat:${chatId}`;
}

function getFolderDropId(folder: string) {
  return `folder:${folder}`;
}

function readFolderDropId(id: string | null) {
  if (!id) {
    return null;
  }

  if (id === DROP_ZONE_UNGROUPED) {
    return null;
  }

  return id.startsWith("folder:") ? id.slice("folder:".length) : null;
}

function ChatItem({ item }: { item: ChatListItem }) {
  const t = useExtracted();
  const pathname = usePathname();
  const { push } = useRouter();
  const utils = trpc.useUtils();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [draft, setDraft] = useState(() => createChatItemDraft(item));
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: getChatDragId(item.id),
    data: {
      chatId: item.id,
      folder: item.folder,
      type: "chat",
    } satisfies ChatDragPayload & { type: "chat" },
  });

  // Warm tRPC chat payload on intent so ChatRouteHost can paint without waiting.
  const prefetchChatPage = () => {
    void utils.chat.getChatPage.prefetch({ id: item.id });
  };

  const openDetails = () => {
    setDraft(createChatItemDraft(item));
    setIsDetailsOpen(true);
  };

  const handleDetailsOpenChange = (open: boolean) => {
    if (open) {
      setDraft(createChatItemDraft(item));
    }
    setIsDetailsOpen(open);
  };

  const deleteChat = trpc.chat.deleteChat.useMutation({
    onSuccess: async () => {
      await utils.chat.getChats.invalidate();
      if (pathname === `/chat/${item.id}`) {
        push("/chat");
      }
    },
  });

  const updateChat = trpc.chat.updateChat.useMutation({
    onSuccess: async () => {
      await utils.chat.getChats.invalidate();
      setIsDetailsOpen(false);
    },
  });

  const handleSave = () => {
    const normalizedTitle = draft.title.trim() || null;

    updateChat.mutate({
      id: item.id,
      title: normalizedTitle,
      folder: draft.folder.trim() || null,
      tags: parseTagsInput(draft.tagsInput),
    });
  };

  const handleTogglePin = () => {
    updateChat.mutate({
      id: item.id,
      pinned: !item.pinned,
    });
  };

  const dragStyle = transform
    ? ({
        transform: CSS.Translate.toString(transform),
      } satisfies CSSProperties)
    : undefined;

  return (
    <>
      <SidebarMenuItem
        ref={setNodeRef}
        className={isDragging ? "z-20 opacity-45" : undefined}
        style={{
          ...dragStyle,
          contentVisibility: "auto",
          containIntrinsicSize: "auto 2.75rem",
        }}
      >
        {/* Thin /chat/[id] page + ChatRouteHost SPA host. Prefetch message payload
            on hover/focus so the pane paints from tRPC cache on click. */}
        <SidebarMenuButton
          {...attributes}
          {...listeners}
          className={
            item.tags.length > 0
              ? "cursor-grab py-6 active:cursor-grabbing"
              : "cursor-grab active:cursor-grabbing"
          }
          isActive={pathname === `/chat/${item.id}`}

          render={
            <Link
              href={`/chat/${item.id}`}
              className="flex min-w-0 items-center gap-2"
              onMouseEnter={prefetchChatPage}
              onFocus={prefetchChatPage}
              onTouchStart={prefetchChatPage}
            />
          }
        >
          <div className="min-w-0 flex-1">
            <div className="truncate leading-5">{item.title ?? t("Untitled")}</div>
            {item.tags.length > 0 ? (
              <div className="mt-1 flex items-center gap-1 overflow-hidden text-[11px] text-muted-foreground">
                {item.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="outline" className="h-4 px-1.5 text-[10px]">
                    {tag}
                  </Badge>
                ))}
                {item.tags.length > 2 ? <span>+{item.tags.length - 2}</span> : null}
              </div>
            ) : null}
          </div>
          {item.pinned ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : null}
        </SidebarMenuButton>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuAction />}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">{t("More")}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuItem onClick={openDetails}>
              <Pencil className="size-4" />
              <span>{t("Edit details")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleTogglePin}>
              <Pin className="size-4" />
              <span>{item.pinned ? t("Unpin") : t("Pin")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => deleteChat.mutate({ id: item.id })}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" />
              <span>{t("Delete")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <Dialog open={isDetailsOpen} onOpenChange={handleDetailsOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Chat Details")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">{t("Title")}</div>
              <Input
                aria-label={t("Chat title")}
                autoComplete="off"
                name="chat-title"
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">{t("Folder")}</div>
              <Input
                aria-label={t("Folder")}
                autoComplete="off"
                name="chat-folder"
                placeholder={t("e.g. Work")}
                value={draft.folder}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, folder: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">{t("Tags")}</div>
              <Input
                aria-label={t("Tags")}
                autoComplete="off"
                name="chat-tags"
                placeholder={t("Comma-separated tags")}
                value={draft.tagsInput}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, tagsInput: event.target.value }))
                }
              />
            </div>
            <Button
              type="button"
              variant={item.pinned ? "default" : "outline"}
              className="w-full justify-center gap-2"
              onClick={handleTogglePin}
              disabled={updateChat.isPending}
            >
              <Pin className="size-4" />
              {item.pinned ? t("Pinned") : t("Pin this chat")}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={handleSave} disabled={updateChat.isPending}>
              {updateChat.isPending ? <Spinner /> : null}
              {t("Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FolderDropItem({
  activeChatId,
  expanded,
  folder,
  onToggle,
}: {
  activeChatId: string | null;
  expanded: boolean;
  folder: FolderGroup;
  onToggle: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: getFolderDropId(folder.folder),
  });
  const isActive = folder.items.some((item) => item.id === activeChatId);

  return (
    <SidebarMenuItem>
      <button
        ref={setNodeRef}
        className={[
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/88",
          isOver
            ? "bg-sidebar-primary/12 ring-1 ring-sidebar-primary/30"
            : "hover:bg-sidebar-accent/70",
        ].join(" ")}
        onClick={onToggle}
        type="button"
      >
        <ChevronRight
          className={[
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded ? "rotate-90" : "",
          ].join(" ")}
        />
        {expanded ? (
          <FolderOpen className="size-4 shrink-0 text-sidebar-primary" />
        ) : (
          <FolderClosed className="size-4 shrink-0 text-sidebar-primary" />
        )}
        <span className="min-w-0 flex-1 truncate">{folder.folder}</span>
        <span className="rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {folder.items.length}
        </span>
      </button>
    </SidebarMenuItem>
  );
}

function FolderSection({
  activeChatId,
  folderGroups,
  onRequestCreateFolder,
}: {
  activeChatId: string | null;
  folderGroups: FolderGroup[];
  onRequestCreateFolder: () => void;
}) {
  const t = useExtracted();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    const activeFolder = folderGroups.find((group) =>
      group.items.some((item) => item.id === activeChatId),
    );
    if (!activeFolder) {
      return;
    }

    startTransition(() => {
      setExpandedFolders((current) => {
        if (current.has(activeFolder.folder)) {
          return current;
        }

        const next = new Set(current);
        next.add(activeFolder.folder);
        return next;
      });
    });
  }, [activeChatId, folderGroups]);

  const toggleFolder = (folder: string) => {
    startTransition(() => {
      setExpandedFolders((current) => {
        const next = new Set(current);
        if (next.has(folder)) {
          next.delete(folder);
        } else {
          next.add(folder);
        }
        return next;
      });
    });
  };

  return (
    <Fragment>
      <SidebarMenuItem className="mt-4 first:mt-0">
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-2">
          <div className="text-xs font-medium tracking-wider text-muted-foreground">
            {t("Folders")}
          </div>
          <Button
            className="h-6"
            onClick={onRequestCreateFolder}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </SidebarMenuItem>
      {folderGroups.length === 0 ? (
        <SidebarMenuItem>
          <div className="p-2 text-xs text-muted-foreground">{t("No folders yet")}</div>
        </SidebarMenuItem>
      ) : null}
      {folderGroups.map((group) => {
        const expanded = expandedFolders.has(group.folder);

        return (
          <Fragment key={group.folder}>
            <FolderDropItem
              activeChatId={activeChatId}
              expanded={expanded}
              folder={group}
              onToggle={() => toggleFolder(group.folder)}
            />
            {expanded ? (
              <div className="relative ml-4 space-y-1 border-l border-sidebar-border/80 pl-2">
                {group.items.map((item) => (
                  <ChatItem key={item.id} item={item} />
                ))}
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </Fragment>
  );
}

function RemoveFromFolderDropZone({ visible }: { visible: boolean }) {
  const t = useExtracted();
  const { isOver, setNodeRef } = useDroppable({
    id: DROP_ZONE_UNGROUPED,
  });

  if (!visible) {
    return null;
  }

  return (
    <SidebarMenuItem className="mt-3">
      <button
        ref={setNodeRef}
        className={[
          "flex w-full items-center gap-2 rounded-md border border-dashed p-2 text-left text-xs transition-colors",
          isOver
            ? "border-sidebar-primary/50 bg-sidebar-primary/10 text-sidebar-foreground"
            : "border-sidebar-border/80 text-muted-foreground hover:border-sidebar-primary/30 hover:bg-sidebar-accent/60",
        ].join(" ")}
        type="button"
      >
        <FolderClosed className="size-3.5 shrink-0" />
        <span>{t("Drop here to remove from folder")}</span>
      </button>
    </SidebarMenuItem>
  );
}

export function AppSidebarChatList({
  isLoading,
  errorMessage,
  chats,
  customFolders,
  activeChatId,
  onRequestCreateFolder,
}: {
  isLoading: boolean;
  errorMessage: string | null;
  chats: ChatListItem[];
  customFolders: string[];
  activeChatId: string | null;
  onRequestCreateFolder: () => void;
}) {
  const t = useExtracted();
  const utils = trpc.useUtils();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );
  const [activeDragChat, setActiveDragChat] = useState<ChatDragPayload | null>(null);

  const pinnedChats = chats
    .filter((item) => item.pinned)
    .toSorted((a, b) => compareDesc(a.updated_at, b.updated_at));
  const folderChats = chats.filter((item) => !item.pinned && item.folder);
  const ungroupedChats = chats.filter((item) => !item.pinned && !item.folder);
  const folderGroups = mergeFolderGroups(groupChatsByFolder(folderChats), customFolders);
  const recencyGroups = groupChatsByRecency(ungroupedChats);

  const moveChatToFolder = trpc.chat.updateChat.useMutation({
    onSuccess: async () => {
      await utils.chat.getChats.invalidate();
      setActiveDragChat(null);
    },
    onError: () => {
      setActiveDragChat(null);
      toast.error(t("Failed to move chat. Please try again."));
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const payload = event.active.data.current;
    if (!payload || payload.type !== "chat") {
      return;
    }

    setActiveDragChat({
      chatId: payload.chatId,
      folder: payload.folder,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const payload = event.active.data.current;
    const dragPayload =
      payload && payload.type === "chat" ? (payload as ChatDragPayload & { type: "chat" }) : null;
    const chatId = dragPayload?.chatId ?? null;
    const nextFolder = readFolderDropId(event.over?.id?.toString() ?? null);

    if (!chatId || !dragPayload || !event.over) {
      setActiveDragChat(null);
      return;
    }

    if (dragPayload.folder === nextFolder) {
      setActiveDragChat(null);
      return;
    }

    moveChatToFolder.mutate({
      id: chatId,
      folder: nextFolder,
    });
  };

  const getRecencyLabel = (key: ChatRecencyBucketKey) => {
    switch (key) {
      case "today":
        return t("Today");
      case "yesterday":
        return t("Yesterday");
      case "thisWeek":
        return t("This week");
      case "thisMonth":
        return t("This month");
      case "thisYear":
        return t("This year");
      case "older":
        return t("Older");
      default:
        return key;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="px-3 py-4 text-sm text-destructive">
        {t("Error")}: {errorMessage}
      </div>
    );
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={() => setActiveDragChat(null)}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <SidebarGroup className="flex-1 overflow-hidden">
        <SidebarGroupContent className="h-full overflow-y-auto">
          <SidebarMenu>
            {chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">{t("No chats yet")}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {t("Start a conversation to see it here")}
                </p>
              </div>
            ) : null}

            {pinnedChats.length > 0 ? (
              <Fragment>
                <SidebarMenuItem className="mt-4 first:mt-0">
                  <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("Pinned")}
                  </div>
                </SidebarMenuItem>
                {pinnedChats.map((item) => (
                  <ChatItem key={item.id} item={item} />
                ))}
              </Fragment>
            ) : null}

            {chats.length > 0 ? (
              <Fragment>
                <FolderSection
                  activeChatId={activeChatId}
                  folderGroups={folderGroups}
                  onRequestCreateFolder={onRequestCreateFolder}
                />
                <RemoveFromFolderDropZone visible={activeDragChat !== null} />
              </Fragment>
            ) : null}

            {recencyGroups.map((group) => (
              <Fragment key={group.key}>
                <SidebarMenuItem className="mt-4 first:mt-0">
                  <div className="px-2 pb-1 pt-2 text-xs font-medium tracking-wider text-muted-foreground">
                    {getRecencyLabel(group.key)}
                  </div>
                </SidebarMenuItem>
                {group.items.map((item) => (
                  <ChatItem key={item.id} item={item} />
                ))}
              </Fragment>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </DndContext>
  );
}
