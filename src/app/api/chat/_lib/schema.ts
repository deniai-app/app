import type { UIMessage } from "ai";
import { z } from "zod";
import { comparisonToolNames } from "@/lib/comparison-settings";

export const ChatRequestSchema = z.object({
  id: z.string().min(1),
  messages: z
    .array(z.record(z.string(), z.unknown()))
    .transform((value) => value as unknown as UIMessage[])
    .optional(),
  model: z.string(),
  comparison: z.boolean().optional(),
  webSearch: z.boolean().optional(),
  enabledTools: z.array(z.enum(comparisonToolNames)).max(2).optional(),
  reasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
  proMode: z.boolean().optional(),
  fastMode: z.boolean().optional(),
  // Reject stale clients instead of silently turning generation into ordinary chat.
  video: z.literal(false).optional(),
  image: z.literal(false).optional(),
  deepResearch: z.boolean().optional(),
  responseStyle: z.enum(["retry", "detailed", "concise"]).optional(),
  forceWebSearch: z.boolean().optional(),
  additionalInstruction: z.string().trim().min(1).optional(),
});

type PendingMessageMetadata = {
  pending?: boolean;
  [key: string]: unknown;
};

export function setPendingState(message: UIMessage, pending: boolean): UIMessage {
  const metadata =
    typeof message.metadata === "object" && message.metadata !== null
      ? ({ ...message.metadata } as PendingMessageMetadata)
      : ({} as PendingMessageMetadata);

  if (pending) {
    metadata.pending = true;
  } else {
    delete metadata.pending;
  }

  return {
    ...message,
    metadata,
  };
}
