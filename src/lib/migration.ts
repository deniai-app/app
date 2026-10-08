import type { ReasoningUIPart, TextUIPart, UIMessage } from "ai";
import { nanoid } from "nanoid";
import { toJsonbSafe } from "@/lib/jsonb";

export type MigrationExport = {
  format: "deni-ai-message-export";
  version: 1;
  exportedAt: string;
  source: {
    app: "deni-ai";
    channel: "canary" | "master" | "unknown";
  };
  chats: Array<{
    id: string;
    title: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    messages: unknown[];
  }>;
};

type LegacyConversation = {
  id?: unknown;
  title?: unknown;
  messages?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type NormalizedConversation = {
  title: string;
  messages: UIMessage[];
  createdAt?: Date;
  updatedAt?: Date;
};

export type MigrationImportResult = {
  conversations: NormalizedConversation[];
  warnings: string[];
};

type UnknownRecord = Record<string, unknown>;

// --- ChatGPT ("conversations.json") export support ---
//
// ChatGPT stores each conversation as a tree (`mapping`): every node has an id,
// an optional `message`, a `parent` id, and `children` ids. Edits/regenerations
// create branches, so we don't try to reconstruct the whole tree — we only
// import the currently-active branch, i.e. the linear path from the root down
// to `current_node` (falling back to the most recently created leaf if
// `current_node` is missing, which happens in some export tool variants).
type ChatGptContent = {
  content_type?: string;
  parts?: unknown[];
  text?: string;
  language?: string;
};

type ChatGptMessage = {
  id?: string;
  author?: { role?: string };
  content?: ChatGptContent;
  create_time?: number | null;
  metadata?: { is_visually_hidden_from_conversation?: boolean };
};

type ChatGptNode = {
  id?: string;
  message?: ChatGptMessage | null;
  parent?: string | null;
  children?: string[];
};

type ChatGptConversation = {
  title?: unknown;
  create_time?: unknown;
  update_time?: unknown;
  current_node?: unknown;
  mapping: Record<string, ChatGptNode>;
};

export function isChatGptExport(payload: unknown): payload is ChatGptConversation[] {
  return (
    Array.isArray(payload) &&
    payload.length > 0 &&
    payload.every((item) => isRecord(item) && isRecord(item.mapping))
  );
}

export function normalizeChatGptExport(payload: ChatGptConversation[]): MigrationImportResult {
  const conversations: NormalizedConversation[] = [];
  const warnings: string[] = [];

  payload.forEach((conversation, index) => {
    try {
      const messages = extractChatGptLinearMessages(
        conversation.mapping,
        conversation.current_node,
      );

      if (!messages.length) {
        warnings.push(`conversation ${index + 1}: no usable messages found`);
        return;
      }

      conversations.push({
        title: normalizeTitle(conversation.title, index),
        messages,
        createdAt: parseUnixSeconds(conversation.create_time),
        updatedAt: parseUnixSeconds(conversation.update_time),
      });
    } catch (error) {
      warnings.push(
        `conversation ${index + 1}: failed to parse (${error instanceof Error ? error.message : "unknown error"})`,
      );
    }
  });

  if (!conversations.length && !warnings.length) {
    warnings.push("no conversations found in payload");
  }

  return { conversations, warnings };
}

function findChatGptLinearPath(
  mapping: Record<string, ChatGptNode>,
  currentNode: unknown,
): string[] {
  let leafId = typeof currentNode === "string" && mapping[currentNode] ? currentNode : null;

  if (!leafId) {
    // Some export variants omit current_node — fall back to the leaf (a node
    // with no children) that was created most recently.
    let best: { id: string; time: number } | null = null;
    for (const [id, node] of Object.entries(mapping)) {
      if (node.children && node.children.length > 0) continue;
      const time = node.message?.create_time ?? 0;
      if (!best || time > best.time) {
        best = { id, time };
      }
    }
    leafId = best?.id ?? null;
  }

  if (!leafId) return [];

  const path: string[] = [];
  const visited = new Set<string>();
  let cursor: string | null | undefined = leafId;

  while (cursor && mapping[cursor] && !visited.has(cursor)) {
    visited.add(cursor);
    path.push(cursor);
    cursor = mapping[cursor].parent;
  }

  return path.reverse();
}

function extractChatGptLinearMessages(
  mapping: Record<string, ChatGptNode>,
  currentNode: unknown,
): UIMessage[] {
  const nodeIds = findChatGptLinearPath(mapping, currentNode);
  const messages: UIMessage[] = [];

  for (const nodeId of nodeIds) {
    const message = mapping[nodeId]?.message;
    if (!message || message.metadata?.is_visually_hidden_from_conversation) {
      continue;
    }

    const role = normalizeChatGptRole(message.author?.role);
    if (!role) {
      continue; // "tool" role and unrecognized authors carry no user-facing text
    }

    const parts = normalizeChatGptContent(message.content);
    if (!parts.length) {
      continue;
    }

    messages.push({
      id: typeof message.id === "string" && message.id.trim().length > 0 ? message.id : nanoid(),
      role,
      parts,
    });
  }

  return messages;
}

function normalizeChatGptRole(role: unknown): UIMessage["role"] | null {
  if (role === "user" || role === "assistant" || role === "system") {
    return role;
  }
  return null;
}

function normalizeChatGptContent(content: ChatGptContent | undefined): UIMessage["parts"] {
  if (!content) {
    return [];
  }

  if (content.content_type === "code") {
    const code = typeof content.text === "string" ? content.text : "";
    if (!code.trim()) {
      return [];
    }
    const language = typeof content.language === "string" ? content.language : "";
    return [createTextPart(`\`\`\`${language}\n${code}\n\`\`\``)];
  }

  if (Array.isArray(content.parts)) {
    const parts: UIMessage["parts"] = [];
    for (const rawPart of content.parts) {
      if (typeof rawPart === "string") {
        if (rawPart.trim()) {
          parts.push(createTextPart(rawPart));
        }
        continue;
      }
      if (isRecord(rawPart) && rawPart.content_type === "image_asset_pointer") {
        // The export doesn't include the underlying binary asset, so we can't
        // recover the image itself — leave a placeholder instead of dropping
        // the message context silently.
        parts.push(createTextPart("[image attachment omitted]"));
      }
    }
    return parts;
  }

  if (typeof content.text === "string" && content.text.trim()) {
    return [createTextPart(content.text)];
  }

  return [];
}

function parseUnixSeconds(value: unknown): Date | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function normalizeMigrationPayload(payload: unknown): MigrationImportResult {
  const result = normalizeParsedPayload(payload);
  // Exports can carry U+0000, which Postgres jsonb/text columns reject (22P05).
  return {
    ...result,
    conversations: result.conversations.map((conversation) => ({
      ...conversation,
      title: conversation.title.replaceAll("\u0000", ""),
      messages: toJsonbSafe(conversation.messages),
    })),
  };
}

function normalizeParsedPayload(payload: unknown): MigrationImportResult {
  if (isChatGptExport(payload)) {
    return normalizeChatGptExport(payload);
  }

  const { conversations: legacyConversations, warnings } = extractLegacyConversations(payload);
  const normalized: NormalizedConversation[] = [];
  const allWarnings = [...warnings];

  legacyConversations.forEach((conversation, index) => {
    const rawMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const { messages, warnings: messageWarnings } = normalizeMessages(rawMessages);
    allWarnings.push(...messageWarnings.map((warning) => `conversation ${index + 1}: ${warning}`));

    if (!messages.length) {
      allWarnings.push(`conversation ${index + 1}: no valid messages found`);
      return;
    }

    normalized.push({
      title: normalizeTitle(conversation.title, index),
      messages,
      createdAt: parseDate(conversation.createdAt),
      updatedAt: parseDate(conversation.updatedAt),
    });
  });

  return { conversations: normalized, warnings: allWarnings };
}

function extractLegacyConversations(payload: unknown): {
  conversations: LegacyConversation[];
  warnings: string[];
} {
  const warnings: string[] = [];

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return { conversations: [], warnings: ["payload array is empty"] };
    }
    if (payload.every(isMessageLike)) {
      return {
        conversations: [
          {
            title: "Imported Chat",
            messages: payload,
          },
        ],
        warnings,
      };
    }
    if (payload.every(isConversationLike)) {
      return { conversations: payload as LegacyConversation[], warnings };
    }
  }

  if (isRecord(payload)) {
    const arrayCandidates = [
      payload.conversations,
      payload.sessions,
      payload.chats,
      payload.items,
      payload.data,
    ];

    for (const candidate of arrayCandidates) {
      if (Array.isArray(candidate)) {
        if (candidate.every(isConversationLike)) {
          return {
            conversations: candidate as LegacyConversation[],
            warnings,
          };
        }
        if (candidate.every(isMessageLike)) {
          return {
            conversations: [
              {
                title: "Imported Chat",
                messages: candidate,
              },
            ],
            warnings,
          };
        }
      }
    }

    if (Array.isArray(payload.messages)) {
      return {
        conversations: [
          {
            title: typeof payload.title === "string" ? payload.title : "Imported Chat",
            messages: payload.messages,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
          },
        ],
        warnings,
      };
    }
  }

  warnings.push("no conversations found in payload");
  return { conversations: [], warnings };
}

function normalizeMessages(rawMessages: unknown[]): {
  messages: UIMessage[];
  warnings: string[];
} {
  const messages: UIMessage[] = [];
  const warnings: string[] = [];

  rawMessages.forEach((raw, index) => {
    const normalized = normalizeMessage(raw);
    if (!normalized) {
      warnings.push(`message ${index + 1} is not recognized`);
      return;
    }
    if (!normalized.parts.length) {
      warnings.push(`message ${index + 1} has no usable parts`);
      return;
    }
    messages.push(normalized);
  });

  return { messages, warnings };
}

function normalizeMessage(raw: unknown): UIMessage | null {
  if (typeof raw === "string") {
    return createTextMessage("user", raw);
  }
  if (!isRecord(raw)) {
    return null;
  }

  const role = normalizeRole(raw.role ?? raw.sender ?? raw.from ?? raw.type);
  const id = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id : nanoid();
  const metadata = isRecord(raw.metadata) ? raw.metadata : undefined;
  const parts = normalizePartsFromMessage(raw);

  if (!parts.length) {
    return null;
  }

  return {
    id,
    role,
    metadata,
    parts,
  };
}

function normalizePartsFromMessage(message: UnknownRecord): UIMessage["parts"] {
  if (Array.isArray(message.parts)) {
    return normalizePartsArray(message.parts);
  }

  if (typeof message.content === "string") {
    return [createTextPart(message.content)];
  }

  if (Array.isArray(message.content)) {
    return normalizeContentArray(message.content);
  }

  if (typeof message.text === "string") {
    return [createTextPart(message.text)];
  }

  if (typeof message.message === "string") {
    return [createTextPart(message.message)];
  }

  return [];
}

function normalizePartsArray(rawParts: unknown[]): UIMessage["parts"] {
  const parts: UIMessage["parts"] = [];

  for (const rawPart of rawParts) {
    if (typeof rawPart === "string") {
      parts.push(createTextPart(rawPart));
      continue;
    }

    if (!isRecord(rawPart)) {
      continue;
    }

    const type = typeof rawPart.type === "string" ? rawPart.type : null;

    if (!type) {
      if (typeof rawPart.text === "string") {
        parts.push(createTextPart(rawPart.text));
      }
      continue;
    }

    if (type === "text") {
      const text = typeof rawPart.text === "string" ? rawPart.text : "";
      parts.push(createTextPart(text));
      continue;
    }

    if (type === "reasoning") {
      const text = typeof rawPart.text === "string" ? rawPart.text : "";
      parts.push(createReasoningPart(text));
      continue;
    }

    parts.push(rawPart as UIMessage["parts"][number]);
  }

  return parts;
}

function normalizeContentArray(rawParts: unknown[]): UIMessage["parts"] {
  const parts: UIMessage["parts"] = [];

  for (const rawPart of rawParts) {
    if (typeof rawPart === "string") {
      parts.push(createTextPart(rawPart));
      continue;
    }

    if (!isRecord(rawPart)) {
      continue;
    }

    const type = typeof rawPart.type === "string" ? rawPart.type : null;
    const textValue = typeof rawPart.text === "string" ? rawPart.text : null;

    if (type === "text" || type === "input_text" || type === "output_text") {
      if (textValue) {
        parts.push(createTextPart(textValue));
      }
      continue;
    }

    if (
      type === "image_url" ||
      type === "image" ||
      type === "input_image" ||
      type === "image-url"
    ) {
      const url = extractImageUrl(rawPart);
      if (url) {
        parts.push({
          type: "file",
          url,
          filename: typeof rawPart.filename === "string" ? rawPart.filename : "image",
          mediaType: typeof rawPart.mediaType === "string" ? rawPart.mediaType : "image/*",
        });
      }
      continue;
    }

    if (textValue) {
      parts.push(createTextPart(textValue));
    }
  }

  return parts;
}

function createTextMessage(role: UIMessage["role"], text: string): UIMessage {
  return {
    id: nanoid(),
    role,
    parts: [createTextPart(text)],
  };
}

function createTextPart(text: string): TextUIPart {
  return { type: "text", text };
}

function createReasoningPart(text: string): ReasoningUIPart {
  return { type: "reasoning", text };
}

function extractImageUrl(part: UnknownRecord): string | null {
  if (typeof part.url === "string") {
    return part.url;
  }

  if (typeof part.image_url === "string") {
    return part.image_url;
  }

  if (isRecord(part.image_url) && typeof part.image_url.url === "string") {
    return part.image_url.url;
  }

  if (typeof part.dataUrl === "string") {
    return part.dataUrl;
  }

  return null;
}

function normalizeTitle(value: unknown, index: number): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return `Imported Chat ${index + 1}`;
}

function normalizeRole(value: unknown): UIMessage["role"] {
  if (typeof value !== "string") {
    return "user";
  }

  switch (value.trim().toLowerCase()) {
    case "assistant":
    case "ai":
    case "bot":
      return "assistant";
    case "system":
      return "system";
    case "user":
    case "human":
      return "user";
    default:
      return "user";
  }
}

function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  return undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isConversationLike(value: unknown): value is LegacyConversation {
  return isRecord(value) && Array.isArray(value.messages);
}

function isMessageLike(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.role === "string" ||
    Array.isArray(value.parts) ||
    typeof value.content === "string" ||
    Array.isArray(value.content) ||
    typeof value.text === "string" ||
    typeof value.message === "string"
  );
}
