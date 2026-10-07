import { sql } from "drizzle-orm";
import { bigint, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const usageQuota = pgTable(
  "usage_quota",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    category: text("category").notNull(), // "basic" | "premium"
    planTier: text("plan_tier").notNull(), // "free" | "pro" | "max"
    limitAmount: integer("limit_amount"),
    unit: text("unit"),
    used: bigint("used", { mode: "number" }).notNull().default(0),
    periodStart: timestamp("period_start").defaultNow().notNull(),
    periodEnd: timestamp("period_end"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => ({
    userCategoryIdx: uniqueIndex("usage_quota_user_category_idx").on(table.userId, table.category),
  }),
);
