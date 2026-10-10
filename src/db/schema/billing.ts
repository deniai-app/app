import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const billing = pgTable(
  "billing",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id"),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    planId: text("plan_id"),
    priceId: text("price_id"),
    status: text("status").default("inactive"),
    cancelAt: integer("cancel_at"),
    mode: text("mode").default("subscription"),
    currentPeriodEnd: timestamp("current_period_end"),
    checkoutSessionId: text("checkout_session_id"),
    flashOfferEndsAt: timestamp("flash_offer_ends_at"),
    firstPaidAt: timestamp("first_paid_at"),
    paymentMethodFingerprint: text("payment_method_fingerprint"),
    // Card funding type from Stripe: "credit" | "debit" | "prepaid" | "unknown"
    cardFunding: text("card_funding"),
    // When the user verified a card via SetupIntent (free-tier boost)
    cardVerifiedAt: timestamp("card_verified_at"),
    // One-time 48h flash offer granted for verifying a card; survives card removal.
    cardOfferGrantedAt: timestamp("card_offer_granted_at"),
    deletionPending: boolean("deletion_pending").notNull().default(false),
    trialPaymentMethodFingerprint: text("trial_payment_method_fingerprint"),
    trialUsedAt: timestamp("trial_used_at"),
    // Max Mode (Usage-based billing for Pro plan)
    maxModeEnabled: boolean("max_mode_enabled").default(false).notNull(),
    maxModeUsageBasic: bigint("max_mode_usage_basic", { mode: "number" }).default(0).notNull(),
    maxModeUsagePremium: bigint("max_mode_usage_premium", { mode: "number" }).default(0).notNull(),
    maxModePeriodStart: timestamp("max_mode_period_start"),
    stripeMeteredSubscriptionItemId: text("stripe_metered_subscription_item_id"),
    stripeMeteredBasicItemId: text("stripe_metered_basic_item_id"),
    stripeMeteredPremiumItemId: text("stripe_metered_premium_item_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => ({
    // Personal billing: one record per user where organizationId is NULL
    userPersonalIdx: uniqueIndex("billing_user_personal_idx")
      .on(table.userId)
      .where(sql`organization_id IS NULL`),
    // Team billing: one record per (user, org) pair
    userOrgIdx: uniqueIndex("billing_user_org_idx")
      .on(table.userId, table.organizationId)
      .where(sql`organization_id IS NOT NULL`),
    customerIdx: index("billing_customer_idx").on(table.stripeCustomerId),
    subscriptionIdx: index("billing_subscription_idx").on(table.stripeSubscriptionId),
    paymentMethodFingerprintIdx: index("billing_payment_method_fingerprint_idx").on(
      table.paymentMethodFingerprint,
    ),
    trialPaymentMethodFingerprintIdx: index("billing_trial_payment_method_fingerprint_idx").on(
      table.trialPaymentMethodFingerprint,
    ),
  }),
);
