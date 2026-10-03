import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const adCampaign = pgTable(
  "ad_campaign",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    // Null for campaigns created before the default language could be selected.
    defaultLanguage: text("default_language", { enum: ["ja", "en"] }),
    japaneseTitle: text("japanese_title"),
    japaneseDescription: text("japanese_description"),
    englishTitle: text("english_title"),
    englishDescription: text("english_description"),
    // Viewer UI languages this campaign is delivered to.
    targetLanguages: text("target_languages", { enum: ["ja", "en"] })
      .array()
      .notNull()
      .default(sql`ARRAY['ja', 'en']::text[]`),
    url: text("url").notNull(),
    plan: text("plan").notNull(), // cpm, cpc, fixed
    status: text("status").notNull().default("review"), // review, rejected, approved, active, paused
    reviewReason: text("review_reason"),
    budgetYen: integer("budget_yen").notNull(),
    spentYen: integer("spent_yen").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    // Two units for a signed-in viewer, one for an anonymous guest.
    weightedImpressionUnits: integer("weighted_impression_units").notNull().default(0),
    weightedClickUnits: integer("weighted_click_units").notNull().default(0),
    stripeSessionId: text("stripe_session_id"),
    checkoutExpiresAt: timestamp("checkout_expires_at"),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("ad_campaign_user_idx").on(table.userId),
    index("ad_campaign_delivery_idx").on(table.status, table.plan),
  ],
);

export const adEvent = pgTable(
  "ad_event",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => adCampaign.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ad_event_campaign_kind_id_idx").on(table.campaignId, table.kind, table.id),
  ],
);
