import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { maxModeMeterEvent } from "@/db/schema";
import { stripe } from "@/lib/stripe";

type MeterEvent = typeof maxModeMeterEvent.$inferSelect;
type PrepareEvent = (event: MeterEvent) => Promise<string>;
const LEASE_MS = 5 * 60_000;
// Stripe deduplicates meter identifiers for 24 hours. Leave a margin for clock
// skew and network delays; ambiguous older deliveries require reconciliation.
const SAFE_RETRY_MS = 23 * 60 * 60_000;

export async function enqueueMaxModeMeterEvent(
  event: Pick<
    MeterEvent,
    "id" | "userId" | "stripeCustomerId" | "category" | "amount" | "occurredAt"
  >,
  database: Pick<typeof db, "insert"> = db,
) {
  if (!Number.isSafeInteger(event.amount) || event.amount <= 0)
    throw new Error("Invalid meter amount.");
  await database
    .insert(maxModeMeterEvent)
    .values(event)
    .onConflictDoNothing({ target: maxModeMeterEvent.id });
}

async function claimEvent(id?: string) {
  return db.transaction(async (transaction) => {
    const now = new Date();
    const [event] = await transaction
      .select()
      .from(maxModeMeterEvent)
      .where(
        and(
          isNull(maxModeMeterEvent.deliveredAt),
          eq(maxModeMeterEvent.requiresReview, false),
          lte(maxModeMeterEvent.nextAttemptAt, now),
          or(isNull(maxModeMeterEvent.leaseUntil), lte(maxModeMeterEvent.leaseUntil, now)),
          id ? eq(maxModeMeterEvent.id, id) : undefined,
        ),
      )
      .orderBy(asc(maxModeMeterEvent.nextAttemptAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!event) return null;
    if (event.firstAttemptAt && now.getTime() - event.firstAttemptAt.getTime() >= SAFE_RETRY_MS) {
      await transaction
        .update(maxModeMeterEvent)
        .set({
          requiresReview: true,
          lastError: "Stripe deduplication window expired; reconcile before resending.",
        })
        .where(eq(maxModeMeterEvent.id, event.id));
      return { ...event, requiresReview: true };
    }
    const [claimed] = await transaction
      .update(maxModeMeterEvent)
      .set({
        leaseToken: randomUUID(),
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        attempts: sql`${maxModeMeterEvent.attempts} + 1`,
      })
      .where(eq(maxModeMeterEvent.id, event.id))
      .returning();
    return claimed;
  });
}

export async function deliverMaxModeMeterEvents(
  prepare: PrepareEvent,
  { id, limit = 5 }: { id?: string; limit?: number } = {},
) {
  const result = { delivered: 0, failed: 0, requiresReview: 0 };
  for (let index = 0; index < limit; index++) {
    const event = await claimEvent(id);
    if (!event) break;
    if (event.requiresReview) {
      result.requiresReview++;
      continue;
    }
    const ownedLease = and(
      eq(maxModeMeterEvent.id, event.id),
      eq(maxModeMeterEvent.leaseToken, event.leaseToken!),
    );
    try {
      const customerId = await prepare(event);
      // Start the deduplication clock immediately before the first meter request,
      // not during retries of customer/meter setup that never sent any usage.
      const [owned] = await db
        .update(maxModeMeterEvent)
        .set({
          stripeCustomerId: customerId,
          firstAttemptAt: event.firstAttemptAt ?? new Date(),
        })
        .where(and(ownedLease, sql`${maxModeMeterEvent.leaseUntil} > now()`))
        .returning({ id: maxModeMeterEvent.id });
      if (!owned) continue;
      await stripe.billing.meterEvents.create(
        {
          event_name: `max_mode_${event.category}`,
          identifier: event.id,
          timestamp: Math.floor(event.occurredAt.getTime() / 1000),
          payload: { stripe_customer_id: customerId, value: String(event.amount) },
        },
        { idempotencyKey: event.id, timeout: 10_000, maxNetworkRetries: 0 },
      );
      await db
        .update(maxModeMeterEvent)
        .set({ deliveredAt: new Date(), leaseToken: null, leaseUntil: null, lastError: null })
        .where(ownedLease);
      result.delivered++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Meter delivery failed";
      await db
        .update(maxModeMeterEvent)
        .set({
          leaseToken: null,
          leaseUntil: null,
          lastError: message.slice(0, 1000),
          nextAttemptAt: new Date(
            Date.now() + Math.min(60_000 * 2 ** Math.min(event.attempts - 1, 10), 60 * 60_000),
          ),
        })
        .where(ownedLease);
      console.error("Max Mode meter event retained for retry", { id: event.id, error });
      result.failed++;
    }
  }
  return result;
}
