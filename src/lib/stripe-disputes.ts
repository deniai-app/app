import { createElement } from "react";
import { and, eq, gte, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db/drizzle";
import { billing, chats, user } from "@/db/schema";
import {
  DisputeAlertEmail,
  disputeAlertEmailSubject,
  type DisputeAlertKind,
} from "@/emails/dispute-alert-email";
import { env } from "@/env";
import { getAdminEmails, parseAdminEmails } from "@/lib/admin-emails";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { formatMinorCurrency } from "@/lib/currency";
import { isMaxModeOnlySubscription } from "@/lib/stripe-subscriptions";
import { stripe } from "@/lib/stripe";

const EFW_METADATA_KEY = "deni_efw_handled";

function objectId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function formatMoney(amountMinor: number, currency: string) {
  return formatMinorCurrency(amountMinor, currency, undefined, "en");
}

function dashboardUrl(path: string, livemode: boolean) {
  return `https://dashboard.stripe.com/${livemode ? "" : "test/"}${path}`;
}

function getDisputeAdminEmails() {
  return [...new Set([...getAdminEmails(), ...parseAdminEmails(env.BLOG_ADMIN_EMAILS)])];
}

async function notifyAdmins({
  kind,
  title,
  preview,
  amount,
  reason,
  status,
  customerEmail,
  userId,
  stripeId,
  dashboardUrl: url,
  notes,
}: {
  kind: DisputeAlertKind;
  title: string;
  preview: string;
  amount: string;
  reason: string;
  status: string;
  customerEmail?: string | null;
  userId?: string | null;
  stripeId: string;
  dashboardUrl: string;
  notes: string[];
}) {
  const recipients = getDisputeAdminEmails();
  if (recipients.length === 0 || !isEmailConfigured()) {
    console.warn("[stripe:disputes] admin alert skipped (no recipients or email disabled)", {
      kind,
      stripeId,
      notes,
    });
    return;
  }

  try {
    await sendEmail({
      to: recipients,
      subject: disputeAlertEmailSubject(kind, amount),
      react: createElement(DisputeAlertEmail, {
        kind,
        title,
        preview,
        amount,
        reason,
        status,
        customerEmail,
        userId,
        stripeId,
        dashboardUrl: url,
        notes,
      }),
    });
  } catch (error) {
    console.error("[stripe:disputes] failed to email admins", error);
  }
}

function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice | null) {
  const subscription = invoice?.parent?.subscription_details?.subscription;
  return objectId(subscription);
}

async function loadInvoiceForPaymentIntent(paymentIntentId: string | null) {
  if (!paymentIntentId) return null;

  const payments = await stripe.invoicePayments.list({
    payment: {
      type: "payment_intent",
      payment_intent: paymentIntentId,
    },
    expand: ["data.invoice"],
    limit: 1,
  });
  const invoice = payments.data[0]?.invoice;
  if (!invoice || typeof invoice === "string" || "deleted" in invoice) {
    return null;
  }
  return invoice;
}

function isThreeDSecureAuthenticated(charge: Stripe.Charge) {
  const threeDSecure = charge.payment_method_details?.card?.three_d_secure;
  return threeDSecure?.result === "authenticated";
}

async function resolveUserFromCustomer(
  customerId: string,
  metadataUserId?: string | null,
): Promise<{ userId: string; email: string | null } | null> {
  const userIdFromMetadata = metadataUserId?.trim() || null;
  let userId = userIdFromMetadata;

  if (!userId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && !("deleted" in customer) && customer.metadata?.userId) {
        userId = customer.metadata.userId;
      }
    } catch (error) {
      console.warn("[stripe:disputes] unable to load customer", error);
    }
  }

  if (!userId) {
    const [record] = await db
      .select({ userId: billing.userId })
      .from(billing)
      .where(eq(billing.stripeCustomerId, customerId))
      .limit(1);
    userId = record?.userId ?? null;
  }

  if (!userId) return null;

  const [account] = await db
    .select({
      id: user.id,
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return {
    userId,
    email: account?.email ?? null,
  };
}

async function loadChatCountAfter(userId: string, since: Date) {
  const [chatCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chats)
    .where(and(eq(chats.uid, userId), gte(chats.updated_at, since)));

  return chatCountRow?.count ?? 0;
}

async function cancelSubscriptionIfNeeded(
  subscriptionId: string | null,
  reason: string,
): Promise<string | null> {
  if (!subscriptionId) return null;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.status === "canceled") {
      return "Subscription already canceled.";
    }

    if (reason === "fraudulent" || isMaxModeOnlySubscription(subscription)) {
      await stripe.subscriptions.cancel(subscriptionId);
      return `Canceled subscription ${subscriptionId} immediately.`;
    }

    if (!subscription.cancel_at_period_end) {
      await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
      return `Set subscription ${subscriptionId} to cancel at period end.`;
    }

    return `Subscription ${subscriptionId} already set to cancel at period end.`;
  } catch (error) {
    console.error("[stripe:disputes] failed to cancel subscription", {
      subscriptionId,
      error,
    });
    return `Failed to cancel subscription ${subscriptionId}.`;
  }
}

export async function handleChargeDisputeCreated(disputeObject: Stripe.Dispute) {
  const dispute = await stripe.disputes.retrieve(disputeObject.id, {
    expand: ["charge", "payment_intent"],
  });

  const charge = dispute.charge;
  if (!charge || typeof charge === "string") {
    console.warn("[stripe:disputes] dispute missing expanded charge", { disputeId: dispute.id });
    return;
  }

  const customerId = objectId(charge.customer);
  const paymentIntentId = objectId(dispute.payment_intent) ?? objectId(charge.payment_intent);
  const invoice = await loadInvoiceForPaymentIntent(paymentIntentId);
  const paymentIntent =
    dispute.payment_intent && typeof dispute.payment_intent !== "string"
      ? dispute.payment_intent
      : null;
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  const metadataUserId =
    invoice?.parent?.subscription_details?.metadata?.userId ??
    paymentIntent?.metadata?.userId ??
    charge.metadata?.userId ??
    null;

  const account = customerId ? await resolveUserFromCustomer(customerId, metadataUserId) : null;
  const chatCount = account
    ? await loadChatCountAfter(account.userId, new Date(charge.created * 1000))
    : null;

  const notes = [
    "Evidence was not submitted. Contest from the Stripe Dashboard if needed.",
    `3D Secure authenticated: ${isThreeDSecureAuthenticated(charge) ? "yes" : "no"}.`,
  ];
  if (chatCount != null) {
    notes.push(`Chats updated at or after the charge: ${chatCount}.`);
  }

  const amount = formatMoney(dispute.amount, dispute.currency);
  const cancelNote = await cancelSubscriptionIfNeeded(subscriptionId, dispute.reason);
  if (cancelNote) notes.push(cancelNote);

  await notifyAdmins({
    kind: "dispute_created",
    title: "Stripe dispute received",
    preview: `A ${amount} dispute needs attention.`,
    amount,
    reason: dispute.reason,
    status: dispute.status,
    customerEmail: account?.email,
    userId: account?.userId,
    stripeId: dispute.id,
    dashboardUrl: dashboardUrl(`disputes/${dispute.id}`, dispute.livemode),
    notes,
  });
}

export async function handleChargeDisputeClosed(disputeObject: Stripe.Dispute) {
  const dispute = await stripe.disputes.retrieve(disputeObject.id, {
    expand: ["charge"],
  });
  const charge = typeof dispute.charge === "string" ? null : dispute.charge;
  const customerId = objectId(charge?.customer);
  const account = customerId ? await resolveUserFromCustomer(customerId) : null;

  await notifyAdmins({
    kind: "dispute_closed",
    title: `Stripe dispute ${dispute.status}`,
    preview: `Dispute ${dispute.id} is ${dispute.status}.`,
    amount: formatMoney(dispute.amount, dispute.currency),
    reason: dispute.reason,
    status: dispute.status,
    customerEmail: account?.email,
    userId: account?.userId,
    stripeId: dispute.id,
    dashboardUrl: dashboardUrl(`disputes/${dispute.id}`, dispute.livemode),
    notes: [`Final status: ${dispute.status}.`],
  });
}

export async function handleEarlyFraudWarning(warningObject: Stripe.Radar.EarlyFraudWarning) {
  const warning = await stripe.radar.earlyFraudWarnings.retrieve(warningObject.id, {
    expand: ["charge"],
  });
  const charge = warning.charge;
  if (!charge || typeof charge === "string") {
    console.warn("[stripe:disputes] EFW missing expanded charge", { warningId: warning.id });
    return;
  }

  if (charge.metadata[EFW_METADATA_KEY] === "true") {
    return;
  }

  const customerId = objectId(charge.customer);
  const account = customerId
    ? await resolveUserFromCustomer(customerId, charge.metadata?.userId)
    : null;
  const invoice = await loadInvoiceForPaymentIntent(objectId(charge.payment_intent));
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  const notes: string[] = [`Fraud type: ${warning.fraud_type}. Actionable: ${warning.actionable}.`];
  const amount = formatMoney(charge.amount, charge.currency);

  if (!warning.actionable) {
    notes.push("Warning is not actionable (already refunded or disputed).");
  } else if (isThreeDSecureAuthenticated(charge)) {
    notes.push("3D Secure authenticated this payment; it was not auto-refunded.");
  } else if (!account) {
    notes.push("Could not resolve the user; payment was not auto-refunded.");
  } else {
    const chargeCreated = new Date(charge.created * 1000);
    const chatCount = await loadChatCountAfter(account.userId, chargeCreated);
    if (chatCount > 0) {
      notes.push(
        `Service was used after payment (${chatCount} chats). Not auto-refunded; wait for a dispute and contest from the Stripe Dashboard if needed.`,
      );
    } else {
      try {
        await stripe.refunds.create({
          charge: charge.id,
          reason: "fraudulent",
        });
        notes.push("Refunded as fraud to avoid a dispute fee (no post-payment service use).");
        const cancelNote = await cancelSubscriptionIfNeeded(subscriptionId, "fraudulent");
        if (cancelNote) notes.push(cancelNote);
      } catch (error) {
        console.error("[stripe:disputes] EFW refund failed", error);
        notes.push("Attempted to refund as fraud but Stripe rejected the refund.");
      }
    }
  }

  try {
    await stripe.charges.update(charge.id, {
      metadata: {
        ...charge.metadata,
        [EFW_METADATA_KEY]: "true",
      },
    });
  } catch (error) {
    console.warn("[stripe:disputes] failed to mark charge EFW handled", error);
  }

  await notifyAdmins({
    kind: "early_fraud_warning",
    title: "Stripe early fraud warning",
    preview: `Early fraud warning on a ${amount} charge.`,
    amount,
    reason: warning.fraud_type,
    status: warning.actionable ? "actionable" : "not_actionable",
    customerEmail: account?.email,
    userId: account?.userId,
    stripeId: warning.id,
    dashboardUrl: dashboardUrl(`payments/${charge.id}`, warning.livemode),
    notes,
  });
}
