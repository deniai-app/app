"use client";

import { CopyIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useExtracted } from "next-intl";
import { ArtifactLivePreview } from "@/components/chat/artifact-live-preview";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useArtifactPreview } from "@/components/chat/artifact-preview-context";
import { Button } from "@/components/ui/button";
import { createSandboxedPreviewDocument } from "@/lib/artifact-preview-document";

const HTML_PREVIEWABLE_LANGUAGES = new Set(["html", "htm"]);
const LIVE_PREVIEWABLE_LANGUAGES = new Set(["html", "htm", "jsx", "tsx", "react"]);

export function ArtifactPreviewPanel() {
  const t = useExtracted();
  const { isOpen, code, language, close } = useArtifactPreview();
  const [copied, setCopied] = useState(false);

  const normalizedLanguage = language.toLowerCase();
  const isHtml = HTML_PREVIEWABLE_LANGUAGES.has(normalizedLanguage);
  const isLivePreviewable = LIVE_PREVIEWABLE_LANGUAGES.has(normalizedLanguage);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleOpenInTab = () => {
    const blob = new Blob([createSandboxedPreviewDocument(code, t("Preview"))], {
      type: "text/html",
    });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // Revoke after a short delay to allow the tab to load
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-[50vw] max-w-3xl min-w-80 flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
          <SheetTitle className="text-sm font-medium">
            {t("Preview")}
            {language ? (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {language}
              </span>
            ) : null}
          </SheetTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleCopy}
              title={t("Copy code")}
            >
              <CopyIcon className="size-3.5" />
              <span className="sr-only">{copied ? t("Copied!") : t("Copy")}</span>
            </Button>
            {isHtml && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={handleOpenInTab}
                title={t("Open in new tab")}
              >
                <ExternalLinkIcon className="size-3.5" />
                <span className="sr-only">{t("Open in new tab")}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={close}
              title={t("Close")}
            >
              <XIcon className="size-3.5" />
              <span className="sr-only">{t("Close")}</span>
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          {isHtml ? (
            <iframe
              key={code}
              srcDoc={code}
              sandbox="allow-scripts"
              className="size-full border-0"
              title={t("HTML preview")}
            />
          ) : isLivePreviewable ? (
            <ArtifactLivePreview code={code} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <p>{t("Preview is not available for this content.")}</p>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <CopyIcon className="size-3.5" />
                {copied ? t("Copied!") : t("Copy code")}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
