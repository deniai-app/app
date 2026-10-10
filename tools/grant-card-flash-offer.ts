/**
 * One-off campaign: give every card-verified, never-paid user a flash offer
 * ending `--hours` (default 48) from now. Never shortens a longer running offer.
 * Marks the one-time card offer as granted, so re-verifying a card later does
 * not grant another one (see grantCardVerificationFlashOffer).
 *
 * Dry run by default; pass `--apply` to write.
 */
import { and, eq, inArray, isNotNull, isNull, lt, notExists, notInArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { alias } from "drizzle-orm/pg-core";

import * as schema from "../src/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const hoursArg = args.find((arg) => arg.startsWith("--hours="));
// Default mirrors CARD_FLASH_OFFER_DURATION_HOURS; billing-offers.ts loads env, so it is not imported.
const hours = hoursArg ? Number(hoursArg.slice("--hours=".length)) : 48;
if (!Number.isFinite(hours) || hours <= 0) {
  console.error(`Invalid --hours value: ${hoursArg}`);
  process.exit(1);
}

const ACTIVE_SUB_STATUSES = ["trialing", "active", "past_due"];
const endsAt = new Date(Date.now() + hours * 60 * 60 * 1000);

const db = drizzle({ connection: { url: databaseUrl, max: 1, prepare: false }, schema });
const { billing, member } = schema;
const teamBilling = alias(billing, "team_billing");

const eligible = and(
  isNull(billing.organizationId),
  isNotNull(billing.cardVerifiedAt),
  isNull(billing.firstPaidAt),
  // Skip accounts that already received the one-time card offer.
  isNull(billing.cardOfferGrantedAt),
  eq(billing.deletionPending, false),
  or(isNull(billing.status), notInArray(billing.status, ACTIVE_SUB_STATUSES)),
  or(isNull(billing.flashOfferEndsAt), lt(billing.flashOfferEndsAt, endsAt)),
  // Members of an active team plan already have paid access.
  notExists(
    db
      .select({ id: teamBilling.id })
      .from(teamBilling)
      .innerJoin(member, eq(teamBilling.organizationId, member.organizationId))
      .where(
        and(
          eq(member.userId, billing.userId),
          isNotNull(teamBilling.organizationId),
          inArray(teamBilling.status, ACTIVE_SUB_STATUSES),
        ),
      ),
  ),
);

if (!apply) {
  const rows = await db.select({ userId: billing.userId }).from(billing).where(eligible);
  console.log(
    `[dry run] ${rows.length} user(s) would get a flash offer ending ${endsAt.toISOString()}. Pass --apply to write.`,
  );
  process.exit(0);
}

const updated = await db
  .update(billing)
  .set({ flashOfferEndsAt: endsAt, cardOfferGrantedAt: new Date(), updatedAt: new Date() })
  .where(eligible)
  .returning({ userId: billing.userId });

console.log(`Granted a flash offer ending ${endsAt.toISOString()} to ${updated.length} user(s).`);
process.exit(0);
