import type { UIMessage } from "ai";
import { safeValidateUIMessages } from "ai";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { getAccessibleProject } from "@/lib/project-access";
import { canCompareModels } from "@/lib/usage";
import { isComparisonConversation } from "@/lib/comparison-conversation";
import {
  CHAT_OLDER_MESSAGE_COUNT,
  sliceLatestMessages,
  sliceOlderMessages,
} from "@/lib/chat-messages";
import { z } from "zod";
import type { db as Db } from "@/db/drizzle";
import { chats, modelComparisons, projects } from "@/db/schema";
import { models } from "@/lib/constants";
import { comparisonSettingsSchema, normalizeComparisonSettings } from "@/lib/comparison-settings";
import { protectedProcedure, router } from "../trpc";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireActiveProject(database: typeof Db, userId: string, projectId: string) {
  const project = await getAccessibleProject(database, userId, projectId);
  if (!project || project.archivedAt) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
}

export type ChatPagePayload = {
  id: string;
  title: string | null;
  projectId: string | null;
  projectName: string | null;
  projectDefaultModel: string | null;
  messages: UIMessage[];
  oldestIndex: number;
  hasMore: boolean;
};

async function loadValidatedMessages(raw: unknown): Promise<UIMessage[]> {
  const validated = await safeValidateUIMessages<UIMessage>({
    messages: (raw as UIMessage[]) ?? [],
  });
  return validated.success ? validated.data : [];
}

async function loadChatMessages(
  database: typeof Db,
  userId: string,
  id: string,
): Promise<UIMessage[] | null> {
  const [row] = await database
    .select({ messages: chats.messages })
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.uid, userId)))
    .limit(1);

  if (!row) {
    return null;
  }

  return loadValidatedMessages(row.messages);
}

async function loadChatPage(
  database: typeof Db,
  userId: string,
  id: string,
): Promise<ChatPagePayload | null> {
  const [row] = await database
    .select({
      id: chats.id,
      title: chats.title,
      projectId: chats.projectId,
      messages: chats.messages,
      projectName: projects.name,
      projectDefaultModel: projects.defaultModel,
    })
    .from(chats)
    .leftJoin(projects, eq(projects.id, chats.projectId))
    .where(and(eq(chats.id, id), eq(chats.uid, userId)))
    .limit(1);

  if (!row) {
    return null;
  }

  let projectName = row.projectName ?? null;
  let projectDefaultModel = row.projectDefaultModel ?? null;
  if (row.projectId) {
    const accessible = await getAccessibleProject(database, userId, row.projectId);
    if (!accessible) {
      projectName = null;
      projectDefaultModel = null;
    }
  }

  const window = sliceLatestMessages(await loadValidatedMessages(row.messages));

  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    projectName,
    projectDefaultModel,
    messages: window.messages,
    oldestIndex: window.oldestIndex,
    hasMore: window.hasMore,
  };
}

export const chatRouter = router({
  getComparisons: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: modelComparisons.id,
        title: modelComparisons.title,
        leftName: modelComparisons.leftName,
        rightName: modelComparisons.rightName,
        updatedAt: modelComparisons.updatedAt,
      })
      .from(modelComparisons)
      .where(eq(modelComparisons.uid, ctx.userId))
      .orderBy(desc(modelComparisons.updatedAt), desc(modelComparisons.id));
  }),
  getComparison: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(modelComparisons)
        .where(and(eq(modelComparisons.id, input.id), eq(modelComparisons.uid, ctx.userId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Comparison not found." });
      return {
        ...row,
        leftSettings: comparisonSettingsSchema.parse(row.leftSettings ?? {}),
        rightSettings: comparisonSettingsSchema.parse(row.rightSettings ?? {}),
        leftMessages: await loadValidatedMessages(row.leftMessages),
        rightMessages: await loadValidatedMessages(row.rightMessages),
      };
    }),
  saveComparisonSession: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1).optional(),
        leftModel: z.string().min(1).max(120),
        rightModel: z.string().min(1).max(120),
        leftSettings: comparisonSettingsSchema.default(() => comparisonSettingsSchema.parse({})),
        rightSettings: comparisonSettingsSchema.default(() => comparisonSettingsSchema.parse({})),
        leftMessages: z.array(z.record(z.string(), z.unknown())).min(2).max(200),
        rightMessages: z.array(z.record(z.string(), z.unknown())).min(2).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await canCompareModels(ctx.userId))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Model comparison requires Pro or Max.",
        });
      }
      const leftModel = models.find((model) => model.value === input.leftModel);
      const rightModel = models.find((model) => model.value === input.rightModel);
      if (!leftModel || !rightModel || leftModel.value === rightModel.value) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose two different models." });
      }
      const [left, right] = await Promise.all([
        safeValidateUIMessages<UIMessage>({ messages: input.leftMessages }),
        safeValidateUIMessages<UIMessage>({ messages: input.rightMessages }),
      ]);
      if (
        !left.success ||
        !right.success ||
        !isComparisonConversation(left.data, true) ||
        !isComparisonConversation(right.data, true)
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Both conversations need an answer." });
      }
      const questions = (messages: UIMessage[]) =>
        messages
          .filter((message) => message.role === "user")
          .map((message) =>
            message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"),
          );
      if (JSON.stringify(questions(left.data)) !== JSON.stringify(questions(right.data))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Comparison questions must match." });
      }
      const values = {
        title: questions(left.data)[0].trim().slice(0, 80),
        leftModel: leftModel.value,
        rightModel: rightModel.value,
        leftName: leftModel.name,
        rightName: rightModel.name,
        leftSettings: normalizeComparisonSettings(leftModel, input.leftSettings),
        rightSettings: normalizeComparisonSettings(rightModel, input.rightSettings),
        leftMessages: left.data.map((message) => ({ ...message, metadata: undefined })),
        rightMessages: right.data.map((message) => ({ ...message, metadata: undefined })),
      };
      if (input.id) {
        const [saved] = await ctx.db
          .update(modelComparisons)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(modelComparisons.id, input.id), eq(modelComparisons.uid, ctx.userId)))
          .returning({ id: modelComparisons.id });
        if (!saved) throw new TRPCError({ code: "NOT_FOUND", message: "Comparison not found." });
        return saved.id;
      }
      const [saved] = await ctx.db
        .insert(modelComparisons)
        .values({ ...values, uid: ctx.userId })
        .returning({ id: modelComparisons.id });
      return saved.id;
    }),
  saveComparison: protectedProcedure
    .input(z.object({ messages: z.array(z.record(z.string(), z.unknown())).min(2).max(200) }))
    .mutation(async ({ ctx, input }) => {
      if (!(await canCompareModels(ctx.userId))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Model comparison requires Pro or Max.",
        });
      }
      const validated = await safeValidateUIMessages<UIMessage>({ messages: input.messages });
      if (!validated.success || !isComparisonConversation(validated.data, true)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A question and an answer are required.",
        });
      }
      const messages = validated.data.map((message) => ({ ...message, metadata: undefined }));
      const title = messages[0].parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join(" ")
        .trim()
        .slice(0, 80);
      const [saved] = await ctx.db
        .insert(chats)
        .values({
          uid: ctx.userId,
          title: title || "Model comparison",
          messages,
        })
        .returning({ id: chats.id });
      return saved.id;
    }),
  getChats: protectedProcedure.query(async ({ ctx }) => {
    const userChats = await ctx.db
      .select({
        id: chats.id,
        title: chats.title,
        projectId: chats.projectId,
        pinned: chats.pinned,
        folder: chats.folder,
        tags: chats.tags,
        created_at: chats.created_at,
        updated_at: chats.updated_at,
      })
      .from(chats)
      .where(eq(chats.uid, ctx.userId))
      .orderBy(desc(chats.updated_at), desc(chats.id));
    return userChats;
  }),
  createChat: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string().min(1).nullable(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      if (input?.projectId) {
        await requireActiveProject(ctx.db, ctx.userId, input.projectId);
      }
      const newChat = await ctx.db
        .insert(chats)
        .values({
          uid: ctx.userId,
          projectId: input?.projectId ?? null,
          title: "New Chat",
        })
        .returning();
      return newChat[0].id;
    }),
  /**
   * Chat pane payload for SPA ChatRouteHost (messages + project label).
   * null when the id is missing or owned by another user.
   */
  getChatPage: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return loadChatPage(ctx.db, ctx.userId, input.id);
    }),
  getOlderMessages: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        beforeIndex: z.number().int().min(0),
        limit: z.number().int().min(1).max(10_000).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const all = await loadChatMessages(ctx.db, ctx.userId, input.id);
      if (!all) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
      }
      return sliceOlderMessages(all, input.beforeIndex, input.limit ?? CHAT_OLDER_MESSAGE_COUNT);
    }),
  getChatTranscript: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const all = await loadChatMessages(ctx.db, ctx.userId, input.id);
      if (!all) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
      }
      return all;
    }),
  /**
   * Lightweight generation status for recovering a pending assistant message.
   * Do not poll the full chat row: messages are stored in JSONB and can be
   * substantially larger than the status needed by the client.
   */
  getChatStatus: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [status] = await ctx.db
        .select({
          activeGenerationId: chats.activeGenerationId,
          updated_at: chats.updated_at,
        })
        .from(chats)
        .where(and(eq(chats.id, input.id), eq(chats.uid, ctx.userId)))
        .limit(1);

      return status ?? null;
    }),
  /**
   * Upsert used when the client navigates to /chat/<uuid> before the row exists
   * (new chat flow). Returns the page payload so the host can paint immediately.
   */
  ensureChat: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        projectId: z.string().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!UUID_RE.test(input.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid chat id" });
      }

      const existing = await loadChatPage(ctx.db, ctx.userId, input.id);
      if (existing) {
        return existing;
      }

      let projectId: string | null = null;
      const rawProjectId = input.projectId ?? null;
      if (rawProjectId && UUID_RE.test(rawProjectId)) {
        const accessible = await getAccessibleProject(ctx.db, ctx.userId, rawProjectId);
        if (accessible && !accessible.archivedAt) {
          projectId = accessible.id;
        }
      }

      await ctx.db
        .insert(chats)
        .values({
          id: input.id,
          uid: ctx.userId,
          projectId,
          title: "New Chat",
        })
        .onConflictDoNothing();

      const row = await loadChatPage(ctx.db, ctx.userId, input.id);
      if (!row) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Chat not found",
        });
      }
      return row;
    }),
  updateChat: protectedProcedure
    .input(
      z
        .object({
          id: z.string().min(1),
          title: z.string().nullable(),
          messages: z.array(
            z.object({
              id: z.uuid(),
              role: z.enum(["user", "assistant"]),
              parts: z.json(),
              attachments: z.json(),
              createdAt: z.date(),
            }),
          ),
          pinned: z.boolean(),
          folder: z.string().trim().max(80).nullable(),
          projectId: z.string().trim().min(1).nullable(),
          tags: z.array(z.string().trim().min(1).max(32)).max(12),
        })
        .partial(),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Chat ID is required",
        });
      }
      const { id, ...fields } = input;
      if (fields.projectId) {
        await requireActiveProject(ctx.db, ctx.userId, fields.projectId);
      }
      const updatedChat = await ctx.db
        .update(chats)
        .set({ ...fields, updated_at: new Date() })
        .where(and(eq(chats.id, id), eq(chats.uid, ctx.userId)))
        .returning();
      if (!updatedChat[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chat not found",
        });
      }
      return updatedChat[0].id;
    }),
  deleteChat: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const deletedChat = await ctx.db
        .delete(chats)
        .where(and(eq(chats.id, input.id), eq(chats.uid, ctx.userId)))
        .returning();
      if (!deletedChat[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chat not found",
        });
      }
      return deletedChat[0];
    }),
  deleteAllChats: protectedProcedure.mutation(async ({ ctx }) => {
    const deletedChats = await ctx.db
      .delete(chats)
      .where(eq(chats.uid, ctx.userId))
      .returning({ id: chats.id });

    return { deletedCount: deletedChats.length };
  }),
});

export type ChatRouter = typeof chatRouter;
