import { and, sql } from "drizzle-orm";
import { billing } from "@/db/schema";

/** Compare entitlement fields read before Stripe I/O, without losing timestamp precision. */
export function unchangedBillingSnapshot(
  record: Pick<
    typeof billing.$inferSelect,
    | "stripeCustomerId"
    | "stripeSubscriptionId"
    | "planId"
    | "priceId"
    | "status"
    | "mode"
    | "currentPeriodEnd"
    | "cancelAt"
  >,
) {
  return and(
    sql`${billing.stripeCustomerId} IS NOT DISTINCT FROM ${record.stripeCustomerId}`,
    sql`${billing.stripeSubscriptionId} IS NOT DISTINCT FROM ${record.stripeSubscriptionId}`,
    sql`${billing.planId} IS NOT DISTINCT FROM ${record.planId}`,
    sql`${billing.priceId} IS NOT DISTINCT FROM ${record.priceId}`,
    sql`${billing.status} IS NOT DISTINCT FROM ${record.status}`,
    sql`${billing.mode} IS NOT DISTINCT FROM ${record.mode}`,
    sql`${billing.cancelAt} IS NOT DISTINCT FROM ${record.cancelAt}`,
    sql`${billing.currentPeriodEnd} IS NOT DISTINCT FROM ${record.currentPeriodEnd?.toISOString() ?? null}::timestamp`,
  );
}
