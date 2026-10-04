import { generateText, type UIMessage } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { chats } from "@/db/schema";
import { env } from "@/env";
import { createDeniOpenRouter } from "@/lib/openrouter-provider";
import { setPendingState } from "@/app/api/chat/_lib/schema";

type ChatUpdateFields = Partial<typeof chats.$inferInsert>;

export async function generateTitle(messages: UIMessage[]): Promise<string> {
  const userMessage = messages.find((m) => m.role === "user");
  if (!userMessage) {
    return "New Chat";
  }

  // Extract text content from parts
  const textParts = userMessage.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ");

  if (!textParts) {
    return "New Chat";
  }

  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return "New Chat";
  }

  const { text } = await generateText({
    model: createDeniOpenRouter({ apiKey }).chat("openai/gpt-oss-20b"),
    system:
      "You are a title generator. Generate a short, concise title (max 50 characters) for the conversation based on the user's first message. Output only the title, nothing else. No quotes, no explanation.",
    prompt: textParts.slice(0, 500),
  });

  return text.trim().slice(0, 50) || "New Chat";
}

export async function getChatById(id: string, userId: string) {
  const [chat] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.uid, userId)));
  return chat;
}

/**
 * Load only the fields needed before starting a generation.
 *
 * The message history is already supplied by the client request, so reading
 * the JSONB transcript here only adds database decoding and transfer cost.
 */
export async function getChatGenerationContextById(id: string, userId: string) {
  const [chat] = await db
    .select({
      id: chats.id,
      title: chats.title,
      projectId: chats.projectId,
    })
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.uid, userId)))
    .limit(1);
  return chat;
}

type ChatUpdateOptions = {
  expectedGenerationId?: string | null;
  nextGenerationId?: string | null;
};

function chatRowWhere(id: string, userId: string, expectedGenerationId?: string | null) {
  return expectedGenerationId !== undefined
    ? sql`${chats.id} = ${id} AND ${chats.uid} = ${userId} AND ${chats.activeGenerationId} = ${expectedGenerationId}`
    : and(eq(chats.id, id), eq(chats.uid, userId));
}

/** Postgres jsonb rejects U+0000 (22P05); web search results can contain it. */
function stringifyForJsonb(value: unknown) {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "string" ? v.replaceAll("\u0000", "") : v,
  );
}

function jsonbSetLastMessage(message: UIMessage) {
  const payload = stringifyForJsonb(message);
  return sql`jsonb_set(
    ${chats.messages},
    ARRAY[(jsonb_array_length(${chats.messages}) - 1)::text],
    ${payload}::jsonb
  )`;
}

export async function updateChat(
  id: string,
  userId: string,
  messages: UIMessage[],
  title?: string,
  options?: ChatUpdateOptions,
) {
  const updates: ChatUpdateFields = {
    // Round-trip keeps parts/metadata intact while stripping NULs and ensuring the payload is serializable for JSONB
    messages: JSON.parse(stringifyForJsonb(messages)) as UIMessage[],
    updated_at: new Date(),
  };

  if (title) {
    updates.title = title;
  }

  if (options?.nextGenerationId !== undefined) {
    updates.activeGenerationId = options.nextGenerationId;
  }

  const [updatedChat] = await db
    .update(chats)
    .set(updates)
    .where(chatRowWhere(id, userId, options?.expectedGenerationId))
    .returning({ id: chats.id });

  if (!updatedChat) {
    throw new Error("Chat not found");
  }

  return updatedChat.id;
}

/** Rewrite only the last JSONB element so streaming does not reserialize the transcript. */
export async function replaceLastChatMessage(
  id: string,
  userId: string,
  message: UIMessage,
  options?: { expectedGenerationId?: string | null },
) {
  const [updatedChat] = await db
    .update(chats)
    .set({
      messages: jsonbSetLastMessage(message),
      updated_at: new Date(),
    })
    .where(chatRowWhere(id, userId, options?.expectedGenerationId))
    .returning({ id: chats.id });

  if (!updatedChat) {
    throw new Error("Chat not found");
  }

  return updatedChat.id;
}

export async function removePendingAssistantMessage(id: string, userId: string) {
  const chat = await getChatById(id, userId);
  const messages = Array.isArray(chat?.messages) ? (chat.messages as UIMessage[]) : null;

  if (!messages || messages.length === 0) {
    return false;
  }

  const lastMessage = messages[messages.length - 1];
  const isPendingAssistant =
    lastMessage?.role === "assistant" &&
    typeof lastMessage.metadata === "object" &&
    lastMessage.metadata !== null &&
    Boolean((lastMessage.metadata as { pending?: boolean }).pending);

  if (!isPendingAssistant) {
    return false;
  }

  await replaceLastChatMessage(id, userId, setPendingState(lastMessage, false));
  return true;
}

export async function clearChatGenerationState(
  id: string,
  userId: string,
  generationId: string,
  lastMessage?: UIMessage,
  title?: string,
) {
  const updates: {
    updated_at: Date;
    activeGenerationId: null;
    title?: string;
    messages?: ReturnType<typeof jsonbSetLastMessage>;
  } = {
    updated_at: new Date(),
    activeGenerationId: null,
  };

  if (lastMessage) {
    updates.messages = jsonbSetLastMessage(lastMessage);
  }

  if (title) {
    updates.title = title;
  }

  const [updatedChat] = await db
    .update(chats)
    .set(updates)
    .where(and(eq(chats.id, id), eq(chats.uid, userId), eq(chats.activeGenerationId, generationId)))
    .returning({ id: chats.id });

  return updatedChat?.id ?? null;
}

export async function stopChatGenerationState(id: string, userId: string) {
  const [updatedChat] = await db
    .update(chats)
    .set({
      activeGenerationId: null,
      updated_at: new Date(),
    })
    .where(and(eq(chats.id, id), eq(chats.uid, userId)))
    .returning({ id: chats.id });

  return updatedChat?.id ?? null;
}

export async function isChatGenerationActive(id: string, userId: string, generationId: string) {
  const [chat] = await db
    .select({ activeGenerationId: chats.activeGenerationId })
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.uid, userId)))
    .limit(1);

  return chat?.activeGenerationId === generationId;
}
