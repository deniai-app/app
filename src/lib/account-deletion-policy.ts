import type Stripe from "stripe";

export function getPersonalCustomerOwnership(
  userId: string,
  metadata: { userId?: string | null; organizationId?: string | null },
): "own" | "team" | "foreign" {
  if (metadata.organizationId) return "team";
  return metadata.userId === userId ? "own" : "foreign";
}

export type AccountDeletionStatus = {
  state: "ready" | "active" | "cancelPending" | "teamOwner";
  periodEnd: string | null;
};

export function classifyDeletionSubscriptions(
  subscriptions: Pick<
    Stripe.Subscription,
    "status" | "cancel_at_period_end" | "cancel_at" | "items"
  >[],
): AccountDeletionStatus {
  const running = subscriptions.filter((sub) =>
    ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(sub.status),
  );
  if (running.some((sub) => !sub.cancel_at_period_end && !sub.cancel_at)) {
    return { state: "active", periodEnd: null };
  }
  if (running.length) {
    const end = Math.max(
      ...running.map((sub) => sub.cancel_at ?? sub.items.data[0]?.current_period_end ?? 0),
    );
    return { state: "cancelPending", periodEnd: end ? new Date(end * 1000).toISOString() : null };
  }
  return { state: "ready", periodEnd: null };
}
