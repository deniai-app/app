"use client";

import type { UIMessage } from "ai";
import { DownloadIcon, FileJsonIcon, FileTextIcon, PrinterIcon } from "lucide-react";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportAsJson,
  exportAsMarkdown,
  exportAsPdf,
  resolveExportMessages,
  triggerDownload,
} from "@/lib/chat-export";
import { trpc } from "@/lib/trpc/react";

interface ChatExportMenuProps {
  chatId: string;
  messages: UIMessage[];
  chatTitle?: string | null;
}

export function ChatExportMenu({ chatId, messages, chatTitle }: ChatExportMenuProps) {
  const t = useExtracted();
  const utils = trpc.useUtils();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<"markdown" | "json" | "pdf" | null>(null);
  const filename = chatTitle ?? "chat";
  const safeFilename = filename.replace(/[^a-z0-9\u3040-\u9fff\s-]/gi, "").trim() || "chat";

  const resolveMessages = (requireFullTranscript = false) =>
    resolveExportMessages(
      messages,
      () => utils.chat.getChatTranscript.fetch({ id: chatId }),
      requireFullTranscript,
    );

  const handleExport = async (format: "markdown" | "json" | "pdf") => {
    if (exporting) return;
    setExporting(format);
    try {
      const fullMessages = await resolveMessages(format === "pdf");
      if (format === "markdown") {
        triggerDownload(
          exportAsMarkdown(fullMessages, chatTitle ?? undefined),
          `${safeFilename}.md`,
          "text/markdown",
        );
      } else if (format === "json") {
        triggerDownload(exportAsJson(fullMessages), `${safeFilename}.json`, "application/json");
      } else {
        await exportAsPdf(fullMessages, {
          title: chatTitle ?? t("Export chat"),
          userLabel: t("User"),
          assistantLabel: "Deni AI",
        });
      }
      setIsMenuOpen(false);
    } catch {
      toast.error(t("Something went wrong on our side. Please try again."));
    } finally {
      setExporting(null);
    }
  };

  return (
    <DropdownMenu
      open={isMenuOpen}
      onOpenChange={(open) => {
        if (!exporting) setIsMenuOpen(open);
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            title={t("Export chat")}
          />
        }
      >
        <DownloadIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          closeOnClick={false}
          disabled={!!exporting}
          aria-busy={exporting === "markdown"}
          onClick={() => handleExport("markdown")}
        >
          {exporting === "markdown" ? (
            <Spinner className="size-4" />
          ) : (
            <FileTextIcon className="size-4" />
          )}
          {t("Export as Markdown")}
        </DropdownMenuItem>
        <DropdownMenuItem
          closeOnClick={false}
          disabled={!!exporting}
          aria-busy={exporting === "json"}
          onClick={() => handleExport("json")}
        >
          {exporting === "json" ? (
            <Spinner className="size-4" />
          ) : (
            <FileJsonIcon className="size-4" />
          )}
          {t("Export as JSON")}
        </DropdownMenuItem>
        <DropdownMenuItem
          closeOnClick={false}
          disabled={!!exporting}
          aria-busy={exporting === "pdf"}
          onClick={() => handleExport("pdf")}
        >
          {exporting === "pdf" ? (
            <Spinner className="size-4" />
          ) : (
            <PrinterIcon className="size-4" />
          )}
          {t("Export as PDF")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
