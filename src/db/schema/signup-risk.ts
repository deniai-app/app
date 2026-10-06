import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

/**
 * Accounts whose sign-up looked automated or part of a batch. Flagged Free
 * accounts get reduced limits until a payment method is verified. Kept apart
 * from `security_activity`, which users can see and export.
 */
export const signupRisk = pgTable("signup_risk", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  flags: jsonb("flags").$type<string[]>().notNull(),
  /** HMAC of the sign-up network, so batches can be grouped without storing the address. */
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
