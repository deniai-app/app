import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { apiKey } from "@/db/schema";
import { generateApiKey, getKeyPrefix, hashApiKey } from "@/lib/api-key-utils";
import { MAX_API_KEYS, withApiKeyLock } from "@/lib/api-key-quota";

import { protectedProcedure, router } from "../trpc";

export const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        lastUsedAt: apiKey.lastUsedAt,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt,
      })
      .from(apiKey)
      .where(eq(apiKey.userId, ctx.userId))
      .orderBy(apiKey.createdAt);
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session?.user?.isAnonymous) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Guest accounts cannot create API keys. Please sign in with an account.",
        });
      }
      const raw = generateApiKey();
      const keyHash = await hashApiKey(raw);
      const keyPrefix = getKeyPrefix(raw);

      const inserted = await withApiKeyLock(ctx.db, ctx.userId, (transaction) =>
        transaction.execute<{ id: string }>(sql`
          INSERT INTO api_key (user_id, name, key_hash, key_prefix)
          SELECT ${ctx.userId}, ${input.name}, ${keyHash}, ${keyPrefix}
          WHERE (SELECT count(*) FROM api_key WHERE user_id = ${ctx.userId}) < ${MAX_API_KEYS}
          RETURNING id
        `),
      );
      const insertedId = Array.isArray(inserted)
        ? inserted[0]?.id
        : (inserted as { rows?: { id: string }[] }).rows?.[0]?.id;

      if (!insertedId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Maximum of 5 API keys allowed. Revoke an existing key first.",
        });
      }

      return { key: raw, keyPrefix };
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await withApiKeyLock(ctx.db, ctx.userId, (transaction) =>
        transaction
          .delete(apiKey)
          .where(and(eq(apiKey.id, input.id), eq(apiKey.userId, ctx.userId)))
          .returning({ id: apiKey.id }),
      );

      if (deleted.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found.",
        });
      }

      return { ok: true };
    }),
});
