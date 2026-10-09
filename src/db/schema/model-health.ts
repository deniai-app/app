import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Latest availability probe result per catalog model, refreshed by the model-health cron. */
export const modelHealth = pgTable("model_health", {
  model: text("model").primaryKey(),
  provider: text("provider").notNull(),
  available: boolean("available").notNull(),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  lastAvailableAt: timestamp("last_available_at", { withTimezone: true }),
});
