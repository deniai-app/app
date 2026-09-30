"use client";

import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import { BrainIcon, Globe } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useExtracted } from "next-intl";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import {
  isBrowseToolInput,
  isBrowseToolOutput,
  isImageToolOutput,
  isSearchResultArray,
  isVideoToolOutput,
  resolveImageModelLabel,
  resolveVeoModelLabel,
  type ImageToolPart,
  type VideoToolPart,
} from "@/components/chat/chat-utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getSafeDisplayUrl, toSafeDownloadHref, toSafeHref } from "@/lib/safe-href";

function toolPartKey(
  messageId: string,
  kind: "video" | "image",
  part: VideoToolPart | ImageToolPart,
) {
  return (
    part.toolCallId ?? `${messageId}-${kind}-${part.state}-${String(part.output).slice(0, 24)}`
  );
}

interface AssistantMessageChainOfThoughtProps {
  messageId: string;
  reasoningParts: UIMessagePart<UIDataTypes, UITools>[];
  isStreamingThis: boolean;
  hasTextParts: boolean;
}

export function AssistantMessageChainOfThought({
  messageId,
  reasoningParts,
  isStreamingThis,
  hasTextParts,
}: AssistantMessageChainOfThoughtProps) {
  const t = useExtracted();

  if (reasoningParts.length === 0) {
    return null;
  }

  return (
    <ChainOfThought defaultOpen={isStreamingThis}>
      <ChainOfThoughtHeader>
        {isStreamingThis && !hasTextParts ? (
          <Shimmer duration={2}>{t("Thinking...")}</Shimmer>
        ) : (
          t("Thought process")
        )}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {reasoningParts.map((part) => {
          if (part.type === "reasoning") {
            const lines = (part.text ?? "").replace(/\r\n?/g, "\n").split("\n");
            const titleRegex = /^\*\*(.+?)\*\*\s*$/;

            type Section = {
              title: string;
              content: string[];
            };
            const sections: Section[] = [];

            let currentTitle: string | null = null;
            let currentContent: string[] = [];

            const flush = () => {
              if (currentTitle === null && currentContent.length === 0) return;

              sections.push({
                title: (currentTitle ?? t("Reasoning")).trim() || t("Reasoning"),
                content: currentContent,
              });

              currentTitle = null;
              currentContent = [];
            };

            for (const rawLine of lines) {
              const line = rawLine;
              const trimmed = line.trim();
              const m = trimmed.match(titleRegex);

              if (m) {
                flush();
                currentTitle = m[1];
              } else {
                currentContent.push(line);
              }
            }
            flush();

            if (sections.length === 0) {
              sections.push({
                title: t("Reasoning"),
                content: [],
              });
            }

            return sections.map((s) => {
              const content = s.content.join("\n").trim();
              return (
                <ChainOfThoughtStep
                  key={`${messageId}-cot-${s.title}-${content.slice(0, 32)}`}
                  icon={BrainIcon}
                  label={s.title || t("Reasoning")}
                  description={content || t("No details")}
                  className="whitespace-pre-wrap"
                  status="complete"
                />
              );
            });
          }

          if (part.type === "tool-search") {
            const isSearching = part.state !== "output-available" && part.state !== "output-error";
            const searchResults = isSearchResultArray(part.output) ? part.output : [];
            const searchKey =
              part.toolCallId ??
              `${messageId}-search-${part.state}-${searchResults[0]?.url ?? "empty"}`;
            return (
              <ChainOfThoughtStep
                key={searchKey}
                icon={Globe}
                label={
                  isSearching ? (
                    <Shimmer duration={2}>{t("Searching...")}</Shimmer>
                  ) : part.state === "output-error" ? (
                    t("Search failed")
                  ) : (
                    t("Found {count} results", {
                      count: searchResults.length.toString(),
                    })
                  )
                }
                status={isSearching ? "active" : "complete"}
              >
                {searchResults.length > 0 && (
                  <ChainOfThoughtSearchResults>
                    {searchResults.map((result) => {
                      const displayUrl = getSafeDisplayUrl(result.url);
                      return (
                        <Link
                          key={result.url}
                          href={displayUrl?.href ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ChainOfThoughtSearchResult>
                            <Globe className="size-3" />
                            {displayUrl?.hostname ?? t("Unknown")}
                          </ChainOfThoughtSearchResult>
                        </Link>
                      );
                    })}
                  </ChainOfThoughtSearchResults>
                )}
              </ChainOfThoughtStep>
            );
          }

          if (part.type === "tool-browse") {
            const isBrowsing = part.state !== "output-available" && part.state !== "output-error";
            const browseOutput = isBrowseToolOutput(part.output) ? part.output : null;
            const browseInput = isBrowseToolInput(part.input) ? part.input : null;
            const browseUrl = browseOutput?.url ?? browseInput?.url ?? "";
            const displayUrl = getSafeDisplayUrl(browseUrl);
            const browseKey =
              part.toolCallId ?? `${messageId}-browse-${part.state}-${browseUrl || "empty"}`;
            const failed =
              part.state === "output-error" ||
              Boolean(browseOutput?.error && !browseOutput.content);

            return (
              <ChainOfThoughtStep
                key={browseKey}
                icon={Globe}
                label={
                  isBrowsing ? (
                    <Shimmer duration={2}>{t("Opening page...")}</Shimmer>
                  ) : failed ? (
                    t("Failed to open page")
                  ) : (
                    t("Opened page")
                  )
                }
                status={isBrowsing ? "active" : "complete"}
              >
                {displayUrl && (
                  <ChainOfThoughtSearchResults>
                    <Link href={displayUrl.href} target="_blank" rel="noreferrer">
                      <ChainOfThoughtSearchResult>
                        <Globe className="size-3" />
                        {browseOutput?.title?.trim() || displayUrl.hostname}
                      </ChainOfThoughtSearchResult>
                    </Link>
                  </ChainOfThoughtSearchResults>
                )}
              </ChainOfThoughtStep>
            );
          }
          return null;
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

interface AssistantMessageVideoPartsProps {
  messageId: string;
  videoToolParts: VideoToolPart[];
}

export function AssistantMessageVideoParts({
  messageId,
  videoToolParts,
}: AssistantMessageVideoPartsProps) {
  const t = useExtracted();

  return (
    <>
      {videoToolParts.map((part) => {
        const key = toolPartKey(messageId, "video", part);

        if (part.state !== "output-available" && part.state !== "output-error") {
          return (
            <Message key={key} from="assistant">
              <MessageContent className="w-full gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  <span>{t("Generating video...")}</span>
                </div>
              </MessageContent>
            </Message>
          );
        }

        if (part.state === "output-error") {
          return (
            <Message key={key} from="assistant">
              <MessageContent className="w-full">
                <Alert className="border-destructive/50 bg-destructive/10 text-destructive">
                  <AlertTitle>{t("Video generation failed")}</AlertTitle>
                  <AlertDescription>
                    {t("Please try again with a different prompt.")}
                  </AlertDescription>
                </Alert>
              </MessageContent>
            </Message>
          );
        }

        const output = isVideoToolOutput(part.output) ? part.output : null;

        if (!output) {
          return (
            <Message key={key} from="assistant">
              <MessageContent className="w-full">
                <Alert className="border-destructive/50 bg-destructive/10 text-destructive">
                  <AlertTitle>{t("Video response unavailable")}</AlertTitle>
                  <AlertDescription>
                    {t("The video output could not be displayed.")}
                  </AlertDescription>
                </Alert>
              </MessageContent>
            </Message>
          );
        }

        const resolvedModelLabel = resolveVeoModelLabel(output.model, output.modelLabel, t);

        return (
          <Message key={key} from="assistant">
            <MessageContent className="w-full gap-3 rounded-xl border border-border/60 bg-background/90 px-4 py-3">
              {output.negativePrompt && (
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <p className="text-xs font-medium text-foreground">{t("Negative prompt")}</p>
                  <p className="text-muted-foreground">{output.negativePrompt}</p>
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/30">
                {/* oxlint-disable-next-line: generated videos don't include captions. */}
                <video controls src={output.videoUrl} className="h-auto w-full" />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {output.resolution && <Badge variant="secondary">{output.resolution}</Badge>}
                {output.aspectRatio && <Badge variant="secondary">{output.aspectRatio}</Badge>}
                {output.durationSeconds && (
                  <Badge variant="secondary">{output.durationSeconds}s</Badge>
                )}
                {resolvedModelLabel ? <Badge variant="outline">{resolvedModelLabel}</Badge> : null}
                {output.seed !== null && output.seed !== undefined && (
                  <Badge variant="outline">
                    {t("Seed {seed}", {
                      seed: output.seed.toString(),
                    })}
                  </Badge>
                )}
              </div>
              {output.operationName && (
                <p className="break-words text-xs text-muted-foreground">
                  {t("Operation: {name}", {
                    name: output.operationName,
                  })}
                </p>
              )}
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  render={<a href={toSafeHref(output.videoUrl)} download />}
                  nativeButton={false}
                >
                  {t("Download video")}
                </Button>
              </div>
            </MessageContent>
          </Message>
        );
      })}
    </>
  );
}

interface AssistantMessageImagePartsProps {
  messageId: string;
  imageToolParts: ImageToolPart[];
}

export function AssistantMessageImageParts({
  messageId,
  imageToolParts,
}: AssistantMessageImagePartsProps) {
  const t = useExtracted();

  return (
    <>
      {imageToolParts.map((part) => {
        const key = toolPartKey(messageId, "image", part);

        if (part.state !== "output-available" && part.state !== "output-error") {
          return (
            <Message key={key} from="assistant">
              <MessageContent className="w-full gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  <span>{t("Generating image...")}</span>
                </div>
              </MessageContent>
            </Message>
          );
        }

        if (part.state === "output-error") {
          return (
            <Message key={key} from="assistant">
              <MessageContent className="w-full">
                <Alert className="border-destructive/50 bg-destructive/10 text-destructive">
                  <AlertTitle>{t("Image generation failed")}</AlertTitle>
                  <AlertDescription>
                    {t("Please try again with a different prompt.")}
                  </AlertDescription>
                </Alert>
              </MessageContent>
            </Message>
          );
        }

        const output = isImageToolOutput(part.output) ? part.output : null;

        if (!output) {
          return (
            <Message key={key} from="assistant">
              <MessageContent className="w-full">
                <Alert className="border-destructive/50 bg-destructive/10 text-destructive">
                  <AlertTitle>{t("Image response unavailable")}</AlertTitle>
                  <AlertDescription>
                    {t("The image output could not be displayed.")}
                  </AlertDescription>
                </Alert>
              </MessageContent>
            </Message>
          );
        }

        const resolvedModelLabel = resolveImageModelLabel(output.model, output.modelLabel);

        return (
          <Message key={key} from="assistant">
            <MessageContent className="w-full gap-3 rounded-xl border border-border/60 bg-background/90 px-4 py-3">
              <div className="grid gap-3">
                {output.imageUrls.map((imageUrl: string, idx: number) => (
                  <div
                    key={imageUrl}
                    className="overflow-hidden rounded-xl border border-border/70 bg-muted/30"
                  >
                    <Image
                      src={imageUrl}
                      alt={t("Generated image {index}", {
                        index: String(idx + 1),
                      })}
                      width={1024}
                      height={1024}
                      className="h-auto w-full"
                      unoptimized
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {output.resolution && <Badge variant="secondary">{output.resolution}</Badge>}
                {output.aspectRatio && <Badge variant="secondary">{output.aspectRatio}</Badge>}
                {output.numberOfImages && output.numberOfImages > 1 && (
                  <Badge variant="secondary">
                    {t("{count} images", {
                      count: String(output.numberOfImages),
                    })}
                  </Badge>
                )}
                {resolvedModelLabel ? <Badge variant="outline">{resolvedModelLabel}</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {output.imageUrls.map((imageUrl: string, idx: number) => (
                  <Button
                    key={imageUrl}
                    size="sm"
                    variant="outline"
                    render={
                      <a
                        href={toSafeDownloadHref(imageUrl)}
                        download={t("image-{index}.png", {
                          index: String(idx + 1),
                        })}
                      />
                    }
                    nativeButton={false}
                  >
                    {t("Download image {index}", { index: String(idx + 1) })}
                  </Button>
                ))}
              </div>
            </MessageContent>
          </Message>
        );
      })}
    </>
  );
}

interface AssistantMessageSourcesProps {
  messageId: string;
  sourceParts: Extract<UIMessagePart<UIDataTypes, UITools>, { type: "source-url" }>[];
}

export function AssistantMessageSources({ messageId, sourceParts }: AssistantMessageSourcesProps) {
  const t = useExtracted();

  if (sourceParts.length === 0) {
    return null;
  }

  return (
    <Sources className="mt-2">
      <SourcesTrigger count={sourceParts.length}>{t("Sources")}</SourcesTrigger>
      <SourcesContent>
        {sourceParts.map((part) => (
          <Source
            key={part.url || part.title || messageId}
            href={toSafeHref(part.url)}
            title={part.title || part.url || t("Source")}
          />
        ))}
      </SourcesContent>
    </Sources>
  );
}
