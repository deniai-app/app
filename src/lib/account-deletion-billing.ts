import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import { APIError } from "better-auth/api";
import { db } from "@/db/drizzle";
import { billing, member } from "@/db/schema";
import { env } from "@/env";
import { stripe } from "@/lib/stripe";
import { escapeStripeSearchValue } from "@/lib/stripe-search";
import {
  classifyDeletionSubscriptions,
  getPersonalCustomerOwnership,
  type AccountDeletionStatus,
} from "@/lib/account-deletion-policy";

async function getPersonalCustomerIds(userId: string) {
  const [record] = await db
    .select({ customerId: billing.stripeCustomerId })
    .from(billing)
    .where(and(eq(billing.userId, userId), isNull(billing.organizationId)))
    .limit(1);
  const ids = new Set<string>();
  if (!env.STRIPE_SECRET_KEY?.trim()) {
    if (record?.customerId)
      throw new Error("Stripe is unavailable; account deletion cannot be completed.");
    return ids;
  }
  if (record?.customerId) {
    const customer = await stripe.customers.retrieve(record.customerId);
    if (!customer.deleted) {
      // Legacy email matching could point a personal billing row at a team customer.
      // The team customer belongs to its organization and must never be deleted here.
      const ownership = getPersonalCustomerOwnership(userId, customer.metadata);
      if (ownership === "team") {
        console.warn("Ignoring team customer referenced by personal billing on account deletion", {
          userId,
          customerId: customer.id,
        });
      } else if (ownership === "foreign") {
        // A different person's personal customer requires manual reconciliation.
        throw new APIError("BAD_REQUEST", {
          message: "Billing customer ownership needs to be resolved before account deletion.",
        });
      } else {
        ids.add(customer.id);
      }
    }
  }
  // Include orphaned personal customers from older concurrent creation attempts.
  let page: string | undefined;
  do {
    const result = await stripe.customers.search({
      query: `metadata['userId']:'${escapeStripeSearchValue(userId)}'`,
      limit: 100,
      page,
    });
    for (const customer of result.data) {
      if (!customer.metadata.organizationId) ids.add(customer.id);
    }
    page = result.next_page ?? undefined;
  } while (page);
  return ids;
}

async function getSubscriptions(customerId: string) {
  const subscriptions: Stripe.Subscription[] = [];
  for await (const sub of stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  })) {
    subscriptions.push(sub);
  }
  return subscriptions;
}

async function isTeamOwner(userId: string) {
  const [ownership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.role, "owner")))
    .limit(1);
  return Boolean(ownership);
}

async function hasRunningTeamSubscription(userId: string) {
  const records = await db
    .select({ customerId: billing.stripeCustomerId })
    .from(billing)
    .where(and(eq(billing.userId, userId), isNotNull(billing.organizationId)));
  if (!records.length) return false;
  if (!env.STRIPE_SECRET_KEY?.trim())
    throw new Error("Stripe is unavailable; account deletion cannot be completed.");
  const all = (
    await Promise.all(records.map((record) => getSubscriptions(record.customerId)))
  ).flat();
  return classifyDeletionSubscriptions(all).state !== "ready";
}

export async function getAccountDeletionStatus(userId: string): Promise<AccountDeletionStatus> {
  if (await isTeamOwner(userId)) return { state: "teamOwner", periodEnd: null };
  const customerIds = await getPersonalCustomerIds(userId);
  const all = (await Promise.all([...customerIds].map(getSubscriptions))).flat();
  if (await hasRunningTeamSubscription(userId)) return { state: "active", periodEnd: null };
  return classifyDeletionSubscriptions(all);
}

/** Run in better-auth's beforeDelete hook, before the billing row is cascaded away. */
export async function deletePersonalStripeCustomers(userId: string) {
  // Check again at deletion time; bypassing the UI or an in-flight transfer
  // must not leave an organization without its owner.
  if (await isTeamOwner(userId)) {
    throw new APIError("BAD_REQUEST", {
      message: "Delete your team or transfer its ownership before deleting your account.",
    });
  }
  const customerIds = await getPersonalCustomerIds(userId);
  const subscriptions = (await Promise.all([...customerIds].map(getSubscriptions))).flat();
  const status = classifyDeletionSubscriptions(subscriptions);
  if (status.state === "active" || (await hasRunningTeamSubscription(userId))) {
    throw new APIError("BAD_REQUEST", {
      message: "Cancel your active subscription before deleting your account.",
    });
  }
  if (status.state === "cancelPending") {
    // Immediate deletion forfeits remaining access, with no proration or refund.
    for (const sub of subscriptions) {
      if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
      await stripe.subscriptions.cancel(sub.id, { prorate: false, invoice_now: false });
    }
  }
  for (const id of customerIds) {
    const customer = await stripe.customers.retrieve(id);
    if (!customer.deleted) await stripe.customers.del(id);
  }
}
