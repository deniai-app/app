"use client";

import { Brain, Plus, Search, Trash2 } from "lucide-react";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type MemoryItem = {
  id: string;
  content: string;
  source: string;
};

type MemorySavedListCardProps = {
  status: "loading" | "error" | "ready";
  items: MemoryItem[];
  newMemory: string;
  onNewMemoryChange: (value: string) => void;
  onAddMemory: () => void;
  onDeleteItem: (id: string) => void;
  onClearClick: () => void;
  pending: {
    adding?: boolean;
    deleting?: boolean;
    clearing?: boolean;
  };
};

export function MemorySavedListCard({
  status,
  items,
  newMemory,
  onNewMemoryChange,
  onAddMemory,
  onDeleteItem,
  onClearClick,
  pending,
}: MemorySavedListCardProps) {
  const t = useExtracted();
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "auto" | "manual">("all");
  const isAdding = Boolean(pending.adding);
  const isDeleting = Boolean(pending.deleting);
  const isClearing = Boolean(pending.clearing);
  const isLoading = status === "loading";
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = items.filter((item) => {
    if (sourceFilter !== "all" && item.source !== sourceFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return item.content.toLowerCase().includes(normalizedQuery);
  });

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5 w-full">
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-4" />
            {t("Saved Memories")}
          </CardTitle>
          <CardDescription>
            {t(
              "These memories are reused across chats. AI can add them automatically, and you can add your own too.",
            )}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          className="w-full shrink-0 text-destructive hover:text-destructive"
          onClick={onClearClick}
          disabled={!items.length || isClearing || isLoading}
        >
          {isClearing ? <Spinner /> : <Trash2 className="size-4" />}
          {t("Clear all memories")}
        </Button>
        <div className="flex gap-2">
          <Input
            value={newMemory}
            onChange={(event) => onNewMemoryChange(event.target.value)}
            placeholder={t("Add something Deni should remember about you")}
          />
          <Button onClick={onAddMemory} disabled={isAdding || !newMemory.trim()}>
            {isAdding ? <Spinner /> : <Plus className="size-4" />}
            {t("Add")}
          </Button>
        </div>

        {items.length ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search memories")}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "all", label: t("All") },
                  { id: "auto", label: t("AI added") },
                  { id: "manual", label: t("You added") },
                ] as const
              ).map((filter) => (
                <Button
                  key={filter.id}
                  type="button"
                  size="sm"
                  variant={sourceFilter === filter.id ? "secondary" : "ghost"}
                  className={cn("h-7 px-2.5", sourceFilter === filter.id && "bg-secondary")}
                  onClick={() => setSourceFilter(filter.id)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {status === "loading" ? (
          <div className="flex items-center justify-center py-6">
            <Spinner />
          </div>
        ) : status === "error" ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {t("Unable to load saved memories right now.")}
          </div>
        ) : items.length ? (
          visibleItems.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              {t("No memories match this search.")}
            </div>
          ) : (
            <div className="max-h-[22rem] space-y-2 overflow-y-auto overscroll-y-contain pr-1">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="break-words text-sm">{item.content}</div>
                    <Badge variant="outline">
                      {item.source === "auto" ? t("AI added") : t("You added")}
                    </Badge>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDeleteItem(item.id)}
                    disabled={isDeleting || isClearing}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {t("No saved memories yet. Add one manually or let AI learn from your chats.")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
