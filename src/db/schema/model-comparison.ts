import type { UIMessage } from "ai";
import type { ComparisonSettings } from "@/lib/comparison-settings";
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const modelComparisons = pgTable(
  "model_comparisons",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    uid: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    leftModel: text("left_model").notNull(),
    rightModel: text("right_model").notNull(),
    leftName: text("left_name").notNull(),
    rightName: text("right_name").notNull(),
    leftSettings: jsonb("left_settings")
      .$type<ComparisonSettings>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    rightSettings: jsonb("right_settings")
      .$type<ComparisonSettings>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    leftMessages: jsonb("left_messages").$type<UIMessage[]>().notNull(),
    rightMessages: jsonb("right_messages").$type<UIMessage[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("model_comparisons_user_updated_idx").on(table.uid, table.updatedAt.desc())],
);
