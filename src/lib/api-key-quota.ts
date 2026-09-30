import { sql } from "drizzle-orm";
import type { db } from "@/db/drizzle";

export const MAX_API_KEYS = 5;
export type ApiKeyTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Serialize all key creation/rotation for an account across server instances. */
export function withApiKeyLock<T>(
  database: typeof db,
  userId: string,
  run: (transaction: ApiKeyTransaction) => Promise<T>,
): Promise<T> {
  return database.transaction(
    async (transaction) => {
      // The existing account row is a stable lock even when it has zero keys.
      // Count checks run in subsequent statements after the lock is acquired,
      // so READ COMMITTED sees keys committed by the previous lock holder.
      await transaction.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
      return run(transaction);
    },
    { isolationLevel: "read committed" },
  );
}
