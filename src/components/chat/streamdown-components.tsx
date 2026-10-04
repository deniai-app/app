"use client";

import type { ComponentProps, ReactNode } from "react";
import { EyeIcon } from "lucide-react";
import { useExtracted } from "next-intl";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import { useArtifactPreview } from "@/components/chat/artifact-preview-context";
import { cn } from "@/lib/utils";

const PREVIEWABLE = new Set(["html", "htm", "jsx", "tsx", "react"]);

const extractText = (node: ReactNode): string => {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
};

const resolveLanguage = (className?: string) =>
  className
    ?.split(/\s+/)
    .find((value) => value.startsWith("language-"))
    ?.slice("language-".length) ?? "text";

type StreamdownCodeProps = ComponentProps<"code"> & {
  "data-block"?: boolean | "";
};

export function StreamdownParagraph({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("whitespace-pre-wrap break-words", className)} {...props} />;
}

export function StreamdownInlineCode({ className, ...props }: ComponentProps<"code">) {
  return (
    <code
      className={cn(
        "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.875em] font-normal tracking-normal",
        className,
      )}
      {...props}
    />
  );
}

export function StreamdownCode({ className, children, ...props }: StreamdownCodeProps) {
  const t = useExtracted();
  const { open } = useArtifactPreview();
  const isBlock = "data-block" in props;

  if (!isBlock) {
    return (
      <StreamdownInlineCode className={className} {...props}>
        {children}
      </StreamdownInlineCode>
    );
  }

  const language = resolveLanguage(className);
  const code = extractText(children).replace(/\n$/, "");
  const isPreviewable = PREVIEWABLE.has(language.toLowerCase());

  return (
    <CodeBlock code={code} language={language} showLineNumbers={false}>
      <CodeBlockHeader>
        <CodeBlockTitle>
          <CodeBlockFilename>{language}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          {isPreviewable ? (
            <Button
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => open(code, language)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <EyeIcon className="size-3.5" />
              <span className="sr-only">{t("Preview")}</span>
            </Button>
          ) : null}
          <CodeBlockCopyButton size="icon-sm" variant="ghost" />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}
