"use client";

import { MessageSquare, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useEffect } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { trpc } from "@/lib/trpc/react";

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === "string" ? [entry.trim()] : [],
  );
}

export function ChatSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useExtracted();
  const router = useRouter();
  const { data } = trpc.chat.getChats.useQuery(undefined, {
    enabled: open,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const utils = trpc.useUtils();

  // Warm route shell + first chat page payload for SPA host.
  useEffect(() => {
    if (!open) {
      return;
    }
    router.prefetch("/chat");
    const firstId = data?.[0]?.id;
    if (firstId) {
      router.prefetch(`/chat/${firstId}`);
      void utils.chat.getChatPage.prefetch({ id: firstId });
    }
  }, [open, data, router, utils.chat.getChatPage]);

  // Parent AppShell closes this dialog on pathname changes.
  const handleSelect = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog
      className="overflow-hidden border-border/60 bg-background/95 p-0 shadow-2xl sm:max-w-2xl"
      description={t("Search your chats or start a new conversation.")}
      onOpenChange={onOpenChange}
      open={open}
      showCloseButton={false}
      title={t("Chat Search")}
    >
      <div className="border-b border-border/60 bg-muted/30">
        <CommandInput placeholder={t("Search chats...")} />
      </div>
      <CommandList className="max-h-[min(60vh,32rem)]">
        <CommandEmpty>{t("No chats found.")}</CommandEmpty>
        <CommandGroup heading={t("Actions")}>
          <CommandItem onSelect={() => handleSelect("/chat")}>
            <Plus className="size-4" />
            <span>{t("New Chat")}</span>
            <div className="flex gap-1 ml-auto">
              <CommandShortcut>Ctrl</CommandShortcut>
              <CommandShortcut>K</CommandShortcut>
            </div>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("Chats")}>
          {data?.map((chat) => {
            const tags = normalizeTags(chat.tags);
            return (
              <CommandItem
                key={chat.id}
                value={chat.id}
                keywords={[chat.title ?? "", chat.folder ?? "", ...tags]}
                onSelect={() => handleSelect(`/chat/${chat.id}`)}
              >
                <MessageSquare className="size-4" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    {chat.title ?? t("Untitled")}
                  </span>
                  {chat.folder || tags.length > 0 ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {[chat.folder, ...tags].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Search className="size-3.5" />
          <span>{t("Jump across your chat history instantly.")}</span>
        </div>
        <div className="flex gap-1 ml-auto">
          <CommandShortcut>Ctrl</CommandShortcut>
          <CommandShortcut>K</CommandShortcut>
        </div>
      </div>
    </CommandDialog>
  );
}
