import { z } from "zod";
import { chats } from "@/db/schema";
import { normalizeMigrationPayload } from "@/lib/migration";
import { protectedProcedure, router } from "../trpc";

/** Five bound parameters per chat row. */
export const IMPORT_BATCH_SIZE = 1000;

export const migrationRouter = router({
  import: protectedProcedure
    .input(
      z.object({
        payload: z.unknown().refine((val) => JSON.stringify(val).length <= 25_000_000, {
          message: "Payload too large (max 25 MB)",
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { conversations, warnings } = normalizeMigrationPayload(input.payload);

      if (!conversations.length) {
        return {
          success: false,
          importedChats: 0,
          importedMessages: 0,
          warnings,
          error: "No conversations found to import",
        };
      }

      const now = new Date();
      const values = conversations.map((conversation) => ({
        uid: ctx.userId,
        title: conversation.title,
        messages: structuredClone(conversation.messages),
        created_at: conversation.createdAt ?? now,
        updated_at: conversation.updatedAt ?? now,
      }));

      // One INSERT per batch keeps each statement below Postgres' 65,534 bind
      // parameter limit; the transaction keeps the import all-or-nothing.
      const importedChats = await ctx.db.transaction(async (tx) => {
        let count = 0;
        for (let index = 0; index < values.length; index += IMPORT_BATCH_SIZE) {
          const inserted = await tx
            .insert(chats)
            .values(values.slice(index, index + IMPORT_BATCH_SIZE))
            .returning({ id: chats.id });
          count += inserted.length;
        }
        return count;
      });

      return {
        success: true,
        importedChats,
        importedMessages: conversations.reduce(
          (count, conversation) => count + conversation.messages.length,
          0,
        ),
        warnings,
      };
    }),
});

export type MigrationRouter = typeof migrationRouter;
