"use client";

import type { UIMessage } from "ai";
import { DownloadIcon, FileJsonIcon, FileTextIcon, PrinterIcon } from "lucide-react";
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="size-7 shrink-0" title="Export chat" />
        }
      >
        <DownloadIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            void resolveMessages().then((fullMessages) => {
              const content = exportAsMarkdown(fullMessages, chatTitle ?? undefined);
              triggerDownload(content, `${safeFilename}.md`, "text/markdown");
            });
          }}
        >
          <FileTextIcon className="size-4" />
          Export as Markdown
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void resolveMessages().then((fullMessages) => {
              const content = exportAsJson(fullMessages);
              triggerDownload(content, `${safeFilename}.json`, "application/json");
            });
          }}
        >
          <FileJsonIcon className="size-4" />
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={exportAsPdf}>
          <PrinterIcon className="size-4" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
