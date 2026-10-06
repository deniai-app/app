import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/db/drizzle";
import { billing } from "@/db/schema";
import { env } from "@/env";
import { findPlanByLookupKey, isTeamPlan } from "@/lib/billing";
import { activatePaidAd, pauseReversedAdCharge, releaseExpiredAdCheckout } from "@/lib/ad-checkout";
import { getBillingFingerprintUpdates } from "@/lib/billing-card-usage";
import { isAffiliatePaidStatus, processAffiliatePurchase } from "@/lib/affiliate";
import {
  findPaidLifetimePurchase,
  grantsSubscriptionAccess,
  resolveSubscriptionStatus,
  isLifetimePlanId,
  isPaidLifetimeRecord,
  saveLifetimePlan,
} from "@/lib/lifetime-plan";
import { resetMaxModeUsage } from "@/lib/max-mode";
import { stripe } from "@/lib/stripe";
import { saveTeamBillingRecord } from "@/lib/team-billing-record";
import {
  handleChargeDisputeClosed,
  handleChargeDisputeCreated,
  handleEarlyFraudWarning,
} from "@/lib/stripe-disputes";
import {
  getLicensedPrice,
  getSubscriptionPeriodEnd,
  isMaxModeOnlySubscription,
  isMeteredMaxModePrice,
} from "@/lib/stripe-subscriptions";
import {
  cancelOrgMembersPersonalSubscriptions,
  getTeamBilling,
  recordTeamAuditEvent,
} from "@/lib/team-billing";

type SubscriptionPayload = {
  userId: string;
  customerId: string;
  subscriptionId: string;
  lookupKey: string | null | undefined;
  priceId: string | null | undefined;
  status: string | null;
  currentPeriodEnd: number | null;
  organizationId?: string | null;
};

async function saveSubscription(payload: SubscriptionPayload) {
  const plan = findPlanByLookupKey(payload.lookupKey ?? undefined);
  const organizationId = payload.organizationId ?? null;
  const fingerprintUpdates = await getBillingFingerprintUpdates({
    customerId: payload.customerId,
    subscriptionId: payload.subscriptionId,
    markTrialUsed: payload.status === "trialing",
  });

  const whereClause = organizationId
    ? eq(billing.organizationId, organizationId)
    : and(eq(billing.userId, payload.userId), isNull(billing.organizationId));

  const [existingRecord] = await db
    .select({
      currentPeriodEnd: billing.currentPeriodEnd,
      firstPaidAt: billing.firstPaidAt,
      maxModeEnabled: billing.maxModeEnabled,
      planId: billing.planId,
      status: billing.status,
      mode: billing.mode,
    })
    .from(billing)
    .where(whereClause)
    .limit(1);

  // A subscription that grants nothing (incomplete, ended, ...) must not replace a
  // paid lifetime plan, and an ended one hands the row back to that lifetime plan.
  if (!organizationId && !grantsSubscriptionAccess(payload.status)) {
    if (isPaidLifetimeRecord(existingRecord)) {
      return;
    }
    if (existingRecord?.firstPaidAt) {
      const lifetime = await findPaidLifetimePurchase(payload.customerId);
      if (lifetime) {
        await saveLifetimePlan(db, {
          userId: payload.userId,
          customerId: payload.customerId,
          purchase: lifetime,
        });
        return;
      }
    }
  }

  const updates = {
    stripeCustomerId: payload.customerId,
    stripeSubscriptionId: payload.subscriptionId,
    priceId: payload.priceId ?? null,
    planId: plan?.id ?? null,
    status: payload.status ?? null,
    mode: "subscription" as const,
    currentPeriodEnd: payload.currentPeriodEnd ? new Date(payload.currentPeriodEnd * 1000) : null,
    organizationId,
    flashOfferEndsAt: organizationId ? undefined : null,
    firstPaidAt:
      organizationId || payload.status === "trialing" || payload.status == null
        ? undefined
        : (existingRecord?.firstPaidAt ?? new Date()),
    paymentMethodFingerprint: fingerprintUpdates.paymentMethodFingerprint,
    cardFunding: fingerprintUpdates.cardFunding,
    trialPaymentMethodFingerprint: fingerprintUpdates.trialPaymentMethodFingerprint,
    trialUsedAt: fingerprintUpdates.trialUsedAt,
  };

  const isRenewal =
    existingRecord?.currentPeriodEnd &&
    updates.currentPeriodEnd &&
    existingRecord.currentPeriodEnd.getTime() !== updates.currentPeriodEnd.getTime() &&
    updates.currentPeriodEnd.getTime() > existingRecord.currentPeriodEnd.getTime();

  if (organizationId) {
    await saveTeamBillingRecord(db, payload.userId, organizationId, updates);
  } else
    await db
      .insert(billing)
      .values({
        userId: payload.userId,
        ...updates,
      })
      .onConflictDoUpdate({
        target: organizationId ? [billing.userId, billing.organizationId] : billing.userId,
        targetWhere: organizationId
          ? sql`organization_id IS NOT NULL`
          : sql`organization_id IS NULL`,
        set: {
          ...updates,
          updatedAt: new Date(),
        },
      });

  if (!organizationId && plan?.id && isAffiliatePaidStatus(payload.status)) {
    await processAffiliatePurchase({
      referredUserId: payload.userId,
      planId: plan.id,
      purchasedAt: updates.firstPaidAt ?? new Date(),
    });
  }

  // If this is a renewal and Max Mode is enabled, reset usage counters
  if (isRenewal && existingRecord?.maxModeEnabled) {
    await resetMaxModeUsage(payload.userId);
    console.log("[stripe:webhook] Reset Max Mode usage for renewal", { userId: payload.userId });
  }
}

async function clearPlanData({
  userId,
  customerId,
  organizationId,
}: {
  userId: string;
  customerId: string;
  organizationId?: string | null;
}) {
  const orgId = organizationId ?? null;
  if (orgId) {
    await saveTeamBillingRecord(db, userId, orgId, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: null,
      priceId: null,
      planId: null,
      status: "inactive",
      mode: null,
      currentPeriodEnd: null,
      checkoutSessionId: null,
      cancelAt: null,
    });
    return;
  }

  // The subscription ended; a lifetime plan bought earlier takes over again.
  const lifetime = await findPaidLifetimePurchase(customerId);
  if (lifetime) {
    await saveLifetimePlan(db, { userId, customerId, purchase: lifetime });
    return;
  }

  await db
    .insert(billing)
    .values({
      userId,
      organizationId: orgId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: null,
      priceId: null,
      planId: null,
      status: "inactive",
      mode: null,
      currentPeriodEnd: null,
      checkoutSessionId: null,
    })
    .onConflictDoUpdate({
      target: orgId ? [billing.userId, billing.organizationId] : billing.userId,
      targetWhere: orgId ? sql`organization_id IS NOT NULL` : sql`organization_id IS NULL`,
      set: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: null,
        priceId: null,
        planId: null,
        status: "inactive",
        mode: null,
        currentPeriodEnd: null,
        checkoutSessionId: null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Activates a paid one-time plan even when the buyer never returns to the
 * checkout page (which is the only other place that confirms it).
 */
async function savePaidLifetimeCheckout(
  session: Stripe.Checkout.Session,
  userId: string,
  planId: string,
) {
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customerId) return;

  const [existing] = await db
    .select({
      status: billing.status,
      mode: billing.mode,
      stripeSubscriptionId: billing.stripeSubscriptionId,
      firstPaidAt: billing.firstPaidAt,
    })
    .from(billing)
    .where(and(eq(billing.userId, userId), isNull(billing.organizationId)))
    .limit(1);

  // A live subscription keeps the row; the lifetime plan is restored from Stripe
  // once that subscription ends.
  if (
    existing?.stripeSubscriptionId &&
    existing.mode === "subscription" &&
    grantsSubscriptionAccess(existing.status)
  ) {
    return;
  }

  const [lineItems, fingerprintUpdates] = await Promise.all([
    stripe.checkout.sessions.listLineItems(session.id, { limit: 1 }),
    getBillingFingerprintUpdates({ customerId, markTrialUsed: false }),
  ]);

  await saveLifetimePlan(db, {
    userId,
    customerId,
    purchase: {
      planId,
      priceId: lineItems.data.at(0)?.price?.id ?? null,
      checkoutSessionId: session.id,
    },
    extra: {
      firstPaidAt: existing?.firstPaidAt ?? new Date(),
      flashOfferEndsAt: null,
      paymentMethodFingerprint: fingerprintUpdates.paymentMethodFingerprint,
      ...(fingerprintUpdates.cardFunding ? { cardFunding: fingerprintUpdates.cardFunding } : {}),
    },
  });
}

const METER_HOST_STATUSES = new Set(["trialing", "active", "past_due"]);

/**
 * The monthly Max Mode meter subscription can be canceled from the Customer
 * Portal. Meter events only invoice through a live subscription carrying the
 * metered prices, so turn Max Mode off for the rows that relied on it instead of
 * letting overage accrue unbilled.
 */
async function disableMaxModeForEndedMeterSubscription(
  subscription: Stripe.Subscription,
  customerId: string,
) {
  const itemIds = subscription.items.data.map((item) => item.id);
  if (itemIds.length === 0) return;

  // The app itself cancels duplicate meter hosts after attaching a new one; the
  // meters are still billable then, so leave Max Mode alone.
  const listed = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
    expand: ["data.items"],
  });
  const meteredElsewhere = listed.data.some(
    (other) =>
      other.id !== subscription.id &&
      METER_HOST_STATUSES.has(other.status) &&
      other.items.data.some((item) => isMeteredMaxModePrice(item.price)),
  );
  if (meteredElsewhere) return;

  await db
    .update(billing)
    .set({
      maxModeEnabled: false,
      stripeMeteredBasicItemId: null,
      stripeMeteredPremiumItemId: null,
      updatedAt: new Date(),
    })
    .where(
      or(
        inArray(billing.stripeMeteredBasicItemId, itemIds),
        inArray(billing.stripeMeteredPremiumItemId, itemIds),
      ),
    );
}

async function resolveUserIdFromCustomer(stripeCustomerId: string, metadataUserId?: string | null) {
  if (metadataUserId) return metadataUserId;

  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if (customer && !("deleted" in customer) && customer.metadata?.userId) {
      return customer.metadata.userId;
    }
  } catch (error) {
    console.warn("Unable to load customer for userId resolution", error);
  }

  const [record] = await db
    .select({ userId: billing.userId })
    .from(billing)
    .where(eq(billing.stripeCustomerId, stripeCustomerId))
    .limit(1);

  return record?.userId ?? null;
}

function resolveOrganizationId(metadata?: Stripe.Metadata | null): string | null {
  return metadata?.organizationId ?? null;
}

export async function POST(req: Request) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook is disabled" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        if (
          typeof subscription !== "object" ||
          subscription === null ||
          subscription.object !== "subscription"
        ) {
          break;
        }

        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;
        if (!customerId) {
          break;
        }

        if (isMaxModeOnlySubscription(subscription)) {
          await disableMaxModeForEndedMeterSubscription(subscription, customerId);
          break;
        }

        const userId = await resolveUserIdFromCustomer(customerId, subscription.metadata?.userId);
        const organizationId = resolveOrganizationId(subscription.metadata);

        if (!userId) {
          console.warn("[stripe:webhook] missing userId for deleted subscription", {
            subscriptionId: subscription.id,
          });
          break;
        }

        // Read the plan before clearPlanData wipes it, for the audit log below.
        const previousTeamBilling = organizationId ? await getTeamBilling(organizationId) : null;

        await clearPlanData({
          userId,
          customerId,
          organizationId,
        });

        if (organizationId) {
          // Best-effort: if the organization was deleted as part of this same
          // cancellation (beforeDeleteOrganization cancels the subscription,
          // which triggers this webhook asynchronously afterwards), the
          // organizationId FK may already be gone by the time this runs — the
          // audit trail is moot in that case since the org's log is gone too.
          try {
            await recordTeamAuditEvent({
              organizationId,
              actorUserId: userId,
              action: "subscription_expired",
              metadata: { planId: previousTeamBilling?.planId ?? null },
            });
          } catch (error) {
            console.warn("[stripe:webhook] Failed to record subscription_expired audit event", {
              organizationId,
              error,
            });
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const eventSubscription = event.data.object;
        if (
          typeof eventSubscription !== "object" ||
          eventSubscription === null ||
          eventSubscription.object !== "subscription"
        ) {
          break;
        }

        // Stripe does not guarantee delivery order, and retries re-send old snapshots. Acting
        // on the event's own copy could undo a newer cancellation, so read the current state.
        let subscription: Stripe.Subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
        } catch (error) {
          // The subscription no longer exists in Stripe; there is nothing to apply.
          if ((error as { code?: unknown } | null)?.code === "resource_missing") {
            break;
          }
          throw error;
        }

        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;
        if (!customerId) {
          break;
        }

        if (isMaxModeOnlySubscription(subscription)) {
          break;
        }

        const price =
          getLicensedPrice(subscription) ?? subscription.items?.data?.[0]?.price ?? null;
        const priceId = price?.id ?? null;
        const lookupKey = price?.lookup_key ?? null;
        const userId = await resolveUserIdFromCustomer(customerId, subscription.metadata?.userId);
        const organizationId = resolveOrganizationId(subscription.metadata);
        const computedStatus = resolveSubscriptionStatus(subscription);

        if (!userId) {
          console.warn("[stripe:webhook] missing userId for subscription", {
            subscriptionId: subscription.id,
          });
          break;
        }

        // Read the previous status before saveSubscription overwrites it, so we
        // can tell a *transition* into past_due from a status that was already
        // past_due (this event also fires on unrelated renewals/updates).
        const previousTeamBilling = organizationId ? await getTeamBilling(organizationId) : null;

        await saveSubscription({
          userId,
          customerId,
          subscriptionId: subscription.id,
          lookupKey,
          priceId,
          status: computedStatus,
          currentPeriodEnd: getSubscriptionPeriodEnd(subscription),
          organizationId,
        });

        // When a team subscription becomes active, cancel all org members' personal subs
        if (
          organizationId &&
          subscription.status === "active" &&
          lookupKey &&
          isTeamPlan(findPlanByLookupKey(lookupKey)?.id ?? "")
        ) {
          await cancelOrgMembersPersonalSubscriptions(organizationId);
        }

        if (
          organizationId &&
          computedStatus === "past_due" &&
          previousTeamBilling?.status !== "past_due"
        ) {
          try {
            await recordTeamAuditEvent({
              organizationId,
              actorUserId: userId,
              action: "payment_failed",
              metadata: { planId: findPlanByLookupKey(lookupKey)?.id ?? null },
            });
          } catch (error) {
            console.warn("[stripe:webhook] Failed to record payment_failed audit event", {
              organizationId,
              error,
            });
          }
        }
        break;
      }
      case "checkout.session.expired": {
        await releaseExpiredAdCheckout(event.data.object);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.metadata?.adCampaignId) {
          await activatePaidAd(session);
          break;
        }
        if (session.mode === "subscription" && session.subscription) {
          const subscription =
            typeof session.subscription === "string"
              ? await stripe.subscriptions.retrieve(session.subscription)
              : session.subscription;

          let userId = session.metadata?.userId ?? subscription.metadata?.userId;

          if (!userId && typeof session.customer === "string") {
            userId = await resolveUserIdFromCustomer(session.customer, session.metadata?.userId);
          }

          const organizationId =
            resolveOrganizationId(session.metadata) ?? resolveOrganizationId(subscription.metadata);

          if (userId) {
            const computedStatus = resolveSubscriptionStatus(subscription);

            const price =
              subscription.items.data.at(0)?.price ?? session.line_items?.data.at(0)?.price ?? null;
            await saveSubscription({
              userId,
              customerId: session.customer as string,
              subscriptionId: subscription.id,
              lookupKey: price?.lookup_key ?? null,
              priceId: price?.id ?? null,
              status: computedStatus,
              currentPeriodEnd: getSubscriptionPeriodEnd(subscription),
              organizationId,
            });

            if (organizationId) {
              const plan = findPlanByLookupKey(price?.lookup_key ?? undefined);
              await recordTeamAuditEvent({
                organizationId,
                actorUserId: userId,
                action: "subscription_purchased",
                metadata: { planId: plan?.id ?? null },
              });
            }
          }
        } else if (session.mode === "payment" && session.payment_status === "paid") {
          const userId =
            session.metadata?.userId ??
            session.client_reference_id ??
            (typeof session.customer === "string"
              ? await resolveUserIdFromCustomer(session.customer)
              : null);
          const planId = session.metadata?.planId;

          if (userId && isLifetimePlanId(planId) && !session.metadata?.organizationId) {
            await savePaidLifetimeCheckout(session, userId, planId);
          }

          if (userId && planId) {
            await processAffiliatePurchase({
              referredUserId: userId,
              planId,
              purchasedAt: new Date(event.created * 1000),
            });
          }
        }
        break;
      }
      case "charge.refunded": {
        await pauseReversedAdCharge(event.data.object);
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object;
        if (typeof dispute.charge === "string") {
          await pauseReversedAdCharge(await stripe.charges.retrieve(dispute.charge));
        }
        if (typeof dispute !== "object" || dispute === null || dispute.object !== "dispute") {
          break;
        }
        await handleChargeDisputeCreated(dispute);
        break;
      }
      case "charge.dispute.closed": {
        const dispute = event.data.object;
        if (typeof dispute !== "object" || dispute === null || dispute.object !== "dispute") {
          break;
        }
        await handleChargeDisputeClosed(dispute);
        break;
      }
      case "radar.early_fraud_warning.created": {
        const warning = event.data.object;
        if (
          typeof warning !== "object" ||
          warning === null ||
          warning.object !== "radar.early_fraud_warning"
        ) {
          break;
        }
        await handleEarlyFraudWarning(warning);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("Error handling Stripe webhook", error);
    return NextResponse.json({ received: true }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
