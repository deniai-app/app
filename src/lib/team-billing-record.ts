import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { db } from "@/db/drizzle";
import { billing } from "@/db/schema";
import { unchangedBillingSnapshot } from "@/lib/billing-snapshot";

type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type TeamBillingUpdates = Partial<
  Omit<typeof billing.$inferInsert, "id" | "userId" | "organizationId" | "createdAt">
>;

/** Ignore historical per-admin copies even before the next Stripe sync. */
export function canonicalTeamBillingRow() {
  return sql`${billing.id} = (SELECT canonical.id FROM billing AS canonical WHERE canonical.organization_id = ${billing.organizationId} ORDER BY canonical.created_at, canonical.id LIMIT 1)`;
}

export function withTeamBillingLock<T>(
  database: Database,
  organizationId: string,
  run: (transaction: Transaction) => Promise<T>,
) {
  return database.transaction(
    async (transaction) => {
      // Also serializes creation when there is no billing row yet.
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`team-billing:${organizationId}`}, 0))`,
      );
      return run(transaction);
    },
    { isolationLevel: "read committed" },
  );
}

export async function findTeamBillingRecord(
  database: Pick<Transaction, "select">,
  organizationId: string,
) {
  const [record] = await database
    .select()
    .from(billing)
    .where(eq(billing.organizationId, organizationId))
    .orderBy(asc(billing.createdAt), asc(billing.id))
    .limit(1);
  return record;
}

/** Team identity is the organization, never whichever admin opened settings. */
export function saveTeamBillingRecord(
  database: Database,
  userId: string,
  organizationId: string,
  updates: TeamBillingUpdates & { stripeCustomerId: string },
): Promise<typeof billing.$inferSelect>;
export function saveTeamBillingRecord(
  database: Database,
  userId: string,
  organizationId: string,
  updates: TeamBillingUpdates & { stripeCustomerId: string },
  expectedSubscriptionId: string | null | undefined,
  expectedBillingRecord?: typeof billing.$inferSelect,
): Promise<typeof billing.$inferSelect | undefined>;
export function saveTeamBillingRecord(
  database: Database,
  userId: string,
  organizationId: string,
  updates: TeamBillingUpdates & { stripeCustomerId: string },
  expectedSubscriptionId?: string | null,
  expectedBillingRecord?: typeof billing.$inferSelect,
) {
  return withTeamBillingLock(database, organizationId, async (transaction) => {
    const existing = await findTeamBillingRecord(transaction, organizationId);
    if (
      expectedSubscriptionId !== undefined &&
      (existing?.stripeSubscriptionId ?? null) !== expectedSubscriptionId
    ) {
      return undefined;
    }
    if (existing) {
      // Preserve old duplicate rows/ledgers, but revoke/update subscription state
      // on ALL of them so no legacy admin copy can retain paid entitlement.
      const [canonical] = await transaction
        .update(billing)
        .set({ ...updates, updatedAt: new Date() })
        .where(
          and(
            eq(billing.id, existing.id),
            expectedBillingRecord ? unchangedBillingSnapshot(expectedBillingRecord) : undefined,
          ),
        )
        .returning();
      if (!canonical) {
        if (expectedBillingRecord) return undefined;
        throw new Error("Team billing record disappeared.");
      }
      // Do not copy the payer's card fingerprint/customer IDs to other users,
      // or discard legacy subscription references needed for safe cleanup.
      const { planId, status, mode, currentPeriodEnd, cancelAt } = updates;
      await transaction
        .update(billing)
        .set({ planId, status, mode, currentPeriodEnd, cancelAt, updatedAt: new Date() })
        .where(and(eq(billing.organizationId, organizationId), ne(billing.id, existing.id)))
        .returning({ id: billing.id });
      return canonical;
    }
    if (expectedBillingRecord) return undefined;
    const [created] = await transaction
      .insert(billing)
      .values({ userId, organizationId, ...updates })
      .returning();
    if (!created) throw new Error("Unable to create team billing record.");
    return created;
  });
}
