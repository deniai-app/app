// Common types, type guards, and utility functions for chat interfaces
import type { ToolUIPart, UIDataTypes, UIMessagePart, UITools } from "ai";

export type SearchResult = {
  title: string;
  url: string;
  description: string;
};

export type BrowseToolOutput = {
  url: string;
  title?: string | null;
  content: string;
  truncated?: boolean;
  contentLength?: number;
  source?: "direct" | "reader" | null;
  error?: string | null;
};

export type BrowseToolInput = {
  url?: string;
  maxChars?: number;
};

export type VideoToolOutput = {
  videoUrl: string;
  operationName?: string | null;
  model?: string | null;
  modelLabel?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  durationSeconds?: number | null;
  seed?: number | null;
  negativePrompt?: string | null;
};

export type ImageToolOutput = {
  imageUrls: string[];
  model?: string | null;
  modelLabel?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  numberOfImages?: number | null;
};

export type VideoToolPart = ToolUIPart<{
  video: {
    input: unknown;
    output: VideoToolOutput;
  };
}>;

export type ImageToolPart = ToolUIPart<{
  image: {
    input: unknown;
    output: ImageToolOutput;
  };
}>;

export const isSearchResultArray = (value: unknown): value is SearchResult[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      "title" in item &&
      "url" in item &&
      "description" in item,
  );

export const isBrowseToolOutput = (value: unknown): value is BrowseToolOutput => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { url?: unknown; content?: unknown };
  return typeof candidate.url === "string" && typeof candidate.content === "string";
};

export const isBrowseToolInput = (value: unknown): value is BrowseToolInput => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { url?: unknown };
  return candidate.url === undefined || typeof candidate.url === "string";
};

export const isVideoToolOutput = (value: unknown): value is VideoToolOutput => {
  if (!value || typeof value !== "object") {
    return false;
  }
  return typeof (value as { videoUrl?: unknown }).videoUrl === "string";
};

export const isImageToolOutput = (value: unknown): value is ImageToolOutput => {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (
    Array.isArray((value as { imageUrls?: unknown }).imageUrls) &&
    (value as { imageUrls?: unknown[] }).imageUrls?.every((url) => typeof url === "string") === true
  );
};

export const isVideoToolPart = (part: UIMessagePart<UIDataTypes, UITools>): part is VideoToolPart =>
  part.type === "tool-video";

export const isImageToolPart = (part: UIMessagePart<UIDataTypes, UITools>): part is ImageToolPart =>
  part.type === "tool-image";

export function resolveImageModelLabel(
  imageModel?: string | null,
  modelLabel?: string | null,
): string | null {
  if (modelLabel) {
    return modelLabel;
  }
  // Keep labels for historical results without retaining generation models.
  return imageModel === "gemini-2.5-flash-image" ? "Nano Banana" : (imageModel ?? null);
}

export function resolveVeoModelLabel(
  veoModel?: string | null,
  modelLabel?: string | null,
  t?: (key: string) => string,
): string | null {
  if (modelLabel) {
    return modelLabel;
  }
  const label = t ?? ((k: string) => k);
  switch (veoModel) {
    case "veo-3.1-generate-preview":
      return label("Veo 3.1");
    case "veo-3.1-fast-generate-preview":
      return label("Veo 3.1 Fast");
    default:
      return veoModel ?? null;
  }
}
