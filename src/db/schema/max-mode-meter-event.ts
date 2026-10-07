import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// No user FK: deleting an account must not discard incurred, unreported charges.
export const maxModeMeterEvent = pgTable(
  "max_mode_meter_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    category: text("category", { enum: ["basic", "premium"] }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseToken: text("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    requiresReview: boolean("requires_review").notNull().default(false),
    lastError: text("last_error"),
  },
  (table) => [
    index("max_mode_meter_event_pending_idx")
      .on(table.nextAttemptAt)
      .where(sql`${table.deliveredAt} IS NULL AND NOT ${table.requiresReview}`),
  ],
);
