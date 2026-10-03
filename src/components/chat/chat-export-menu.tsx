"use client";

import type { UIMessage } from "ai";
import { DownloadIcon, FileJsonIcon, FileTextIcon, PrinterIcon } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportAsJson, exportAsMarkdown, exportAsPdf, triggerDownload } from "@/lib/chat-export";
import { trpc } from "@/lib/trpc/react";

interface ChatExportMenuProps {
  chatId: string;
  messages: UIMessage[];
  chatTitle?: string | null;
}

export function ChatExportMenu({ chatId, messages, chatTitle }: ChatExportMenuProps) {
  const utils = trpc.useUtils();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<"markdown" | "json" | null>(null);
  const filename = chatTitle ?? "chat";
  const safeFilename = filename.replace(/[^a-z0-9\u3040-\u9fff\s-]/gi, "").trim() || "chat";

  const resolveMessages = async () => {
    try {
      const transcript = await utils.chat.getChatTranscript.fetch({ id: chatId });
      return transcript.length > 0 ? transcript : messages;
    } catch {
      return messages;
    }
  };

  const handleExport = async (format: "markdown" | "json") => {
    if (exporting) return;
    setExporting(format);
    try {
      const fullMessages = await resolveMessages();
      if (format === "markdown") {
        triggerDownload(
          exportAsMarkdown(fullMessages, chatTitle ?? undefined),
          `${safeFilename}.md`,
          "text/markdown",
        );
      } else {
        triggerDownload(exportAsJson(fullMessages), `${safeFilename}.json`, "application/json");
      }
      setIsMenuOpen(false);
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
          <Button variant="ghost" size="icon" className="size-7 shrink-0" title="Export chat" />
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
          Export as Markdown
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
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!!exporting} onClick={exportAsPdf}>
          <PrinterIcon className="size-4" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
