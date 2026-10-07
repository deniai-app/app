import { sql } from "drizzle-orm";
import { bigint, boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Keep unsettled usage and its original payer after membership/account changes.
export const usageReservation = pgTable(
  "usage_reservation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    category: text("category", { enum: ["basic", "premium"] }).notNull(),
    unit: text("unit", { enum: ["requests", "tokens"] }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    reservedAmount: bigint("reserved_amount", { mode: "number" }).notNull(),
    baseUsed: bigint("base_used", { mode: "number" }).notNull(),
    limitAmount: bigint("limit_amount", { mode: "number" }),
    maxModeEnabled: boolean("max_mode_enabled").notNull(),
    maxModeLimit: bigint("max_mode_limit", { mode: "number" }),
    billingId: text("billing_id"),
    stripeCustomerId: text("stripe_customer_id"),
    settledAmount: bigint("settled_amount", { mode: "number" }),
    observedAmount: bigint("observed_amount", { mode: "number" }).notNull().default(0),
    maxModeAmount: bigint("max_mode_amount", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    index("usage_reservation_period_idx").on(
      table.userId,
      table.category,
      table.unit,
      table.periodStart,
    ),
    index("usage_reservation_pending_idx")
      .on(table.userId)
      .where(sql`${table.settledAt} IS NULL`),
    index("usage_reservation_stale_idx")
      .on(table.updatedAt)
      .where(sql`${table.settledAt} IS NULL`),
    index("usage_reservation_billing_period_idx")
      .on(table.billingId, table.createdAt)
      .where(sql`${table.settledAt} IS NOT NULL`),
  ],
);
