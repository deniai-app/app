import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

/** Usage reset credits a user can spend to clear their own quota immediately. */
export const resetCreditBalance = pgTable("reset_credit_balance", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  credits: integer("credits").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
