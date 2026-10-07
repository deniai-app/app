import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError } from "better-auth/api";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import * as schema from "@/db/schema";

/** Enforce the OAuth ownership quota in the same transaction as the insert. */
export function limitedAuthAdapter(database = db): ReturnType<typeof drizzleAdapter> {
  return (options) => {
    const adapter = drizzleAdapter(database, { provider: "pg", schema })(options);
    const create = adapter.create.bind(adapter);
    adapter.create = async (input) => {
      const userId = input.data.userId;
      if (input.model !== "oauthClient" || typeof userId !== "string") return create(input);
      return database.transaction(
        async (tx) => {
          await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
          const [result] = await tx
            .select({ value: count() })
            .from(schema.oauthClient)
            .where(eq(schema.oauthClient.userId, userId));
          if ((result?.value ?? 0) >= 10) {
            throw new APIError("FORBIDDEN", {
              message: "You can create at most 10 OAuth clients.",
            });
          }
          return drizzleAdapter(tx, { provider: "pg", schema })(options).create(input);
        },
        { isolationLevel: "read committed" },
      );
    };
    return adapter;
  };
}
