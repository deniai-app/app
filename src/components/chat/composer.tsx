"use client";

import { GlobeIcon } from "lucide-react";
import { useExtracted } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { Spinner } from "@/components/ui/spinner";
import type {
  PromptInputMessage,
  PromptInputProps,
  PromptInputSubmitProps,
} from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import { is } from "zod/v4/locales";

export type ComposerMessage = PromptInputMessage;

const COMPOSER_POPUP_SELECTOR =
  '[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"], [data-slot="select-content"], [data-slot="popover-content"]';

function ComposerAttachments() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <Attachment
          data={attachment}
          key={attachment.id}
          onRemove={() => attachments.remove(attachment.id)}
        >
          <AttachmentPreview />
          <AttachmentInfo />
          {attachment.uploadStatus === "uploading" ? <Spinner className="size-3" /> : null}
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}

type ComposerProps = Pick<PromptInputProps, "globalDrop" | "multiple"> & {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (message: PromptInputMessage) => void;
  onStop?: () => void;
  placeholder?: string;
  className?: string;
  headerClassName?: string;
  textareaClassName?: string;
  searchLabel?: ReactNode;
  webSearch?: boolean;
  onToggleWebSearch?: () => void;
  actionMenuItems?: ReactNode;
  status?: PromptInputSubmitProps["status"];
  tools?: ReactNode;
  voiceInput?: ReactNode;
  bottomContent?: ReactNode;
  isSubmitDisabled?: boolean;
  attachmentsEnabled?: boolean;
  compact?: boolean;
};

export function Composer({
  value,
  onValueChange,
  onSubmit,
  onStop,
  placeholder,
  className,
  headerClassName,
  textareaClassName,
  searchLabel,
  webSearch = false,
  onToggleWebSearch,
  actionMenuItems,
  status,
  tools,
  voiceInput,
  bottomContent,
  isSubmitDisabled,
  globalDrop,
  multiple,
  attachmentsEnabled = true,
  compact = false,
}: ComposerProps) {
  const t = useExtracted();
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !containerRef.current?.contains(target) &&
        !target.closest(COMPOSER_POPUP_SELECTOR)
      ) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, []);

  const disabled = status === "streaming" ? false : (isSubmitDisabled ?? (!value && !status));
  const resolvedSearchLabel = searchLabel ?? t("Search");

  return (
    <div
      ref={containerRef}
      className="w-full"
      onBlur={() => {
        // Portaled menus briefly move focus outside the composer while closing.
        // Check after focus restoration rather than collapsing on that transient blur.
        requestAnimationFrame(() => {
          const focused = document.activeElement;
          if (
            focused instanceof Element &&
            focused !== document.body &&
            !containerRef.current?.contains(focused) &&
            !focused.closest(COMPOSER_POPUP_SELECTOR)
          ) {
            setIsExpanded(false);
          }
        });
      }}
    >
      <PromptInput
        onSubmit={(message) => {
          setIsExpanded(false);
          onSubmit(message);
        }}
        className={cn("h-auto flex-col", className)}
        globalDrop={globalDrop}
        multiple={multiple}
        maxFiles={attachmentsEnabled ? undefined : 0}
      >
        {(!compact || attachmentsEnabled) && (
          <PromptInputHeader className={cn(headerClassName)}>
            <ComposerAttachments />
          </PromptInputHeader>
        )}
        <div
          className={cn(
            "flex w-full min-w-0 items-center gap-1 p-2",
            isExpanded && !compact && "pb-0",
            compact && "py-2",
          )}
        >
          {attachmentsEnabled || actionMenuItems ? (
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger
                className="size-8 shrink-0 text-muted-foreground"
                onClick={() => setIsExpanded(true)}
              />
              <PromptInputActionMenuContent>
                {attachmentsEnabled && <PromptInputActionAddAttachments />}
                {actionMenuItems}
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          ) : null}
          <PromptInputTextarea
            onChange={(event) => onValueChange(event.target.value)}
            onFocus={() => setIsExpanded(true)}
            onClick={() => setIsExpanded(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setIsExpanded(false);
                event.currentTarget.blur();
              }
            }}
            value={value}
            placeholder={placeholder}
            className={cn("min-h-8 min-w-0 flex-1 px-1 py-1.5 leading-5", textareaClassName)}
          />
          {voiceInput}
          <PromptInputSubmit
            className="shrink-0"
            disabled={disabled}
            status={status}
            onStop={onStop}
          />
        </div>
        {!compact || onToggleWebSearch || tools ? (
          <div
            className={cn(
              "grid w-full transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
              isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
            inert={!isExpanded}
            aria-hidden={!isExpanded}
          >
            <div className="min-h-0 overflow-hidden">
              <PromptInputFooter className="flex-wrap justify-start">
                <PromptInputTools className="flex-wrap">
                  {onToggleWebSearch ? (
                    <PromptInputButton
                      variant={webSearch ? "default" : "ghost"}
                      onClick={onToggleWebSearch}
                    >
                      <GlobeIcon size={16} />
                      {resolvedSearchLabel}
                    </PromptInputButton>
                  ) : null}
                  {tools}
                </PromptInputTools>
              </PromptInputFooter>
            </div>
          </div>
        ) : null}
        {bottomContent ? (
          <PromptInputFooter className="justify-start border-t">{bottomContent}</PromptInputFooter>
        ) : null}
      </PromptInput>
    </div>
  );
}
