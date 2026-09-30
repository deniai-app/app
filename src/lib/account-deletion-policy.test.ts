import assert from "node:assert/strict";
import { test } from "vitest";
import type Stripe from "stripe";
import {
  classifyDeletionSubscriptions,
  getPersonalCustomerOwnership,
} from "./account-deletion-policy";

type SubscriptionInput = Parameters<typeof classifyDeletionSubscriptions>[0][number];
function subscription(status: Stripe.Subscription.Status, pending = false): SubscriptionInput {
  return {
    status,
    cancel_at_period_end: pending,
    cancel_at: pending ? 1_800_000_000 : null,
    items: { data: [] } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
  };
}

test("active subscriptions prevent account deletion", () => {
  assert.equal(classifyDeletionSubscriptions([subscription("active")]).state, "active");
  assert.equal(
    classifyDeletionSubscriptions([subscription("active", true), subscription("trialing")]).state,
    "active",
  );
});

test("cancel-pending subscriptions offer immediate or later deletion", () => {
  assert.deepEqual(classifyDeletionSubscriptions([subscription("active", true)]), {
    state: "cancelPending",
    periodEnd: new Date(1_800_000_000 * 1000).toISOString(),
  });
});

test("finished subscriptions allow deletion without a waiting dialog", () => {
  assert.equal(classifyDeletionSubscriptions([subscription("canceled")]).state, "ready");
  assert.equal(classifyDeletionSubscriptions([]).state, "ready");
});

test("a personal billing row pointing to a team customer never claims that customer", () => {
  assert.equal(
    getPersonalCustomerOwnership("person", { userId: "team-owner", organizationId: "org" }),
    "team",
  );
  assert.equal(getPersonalCustomerOwnership("person", { userId: "person" }), "own");
  assert.equal(getPersonalCustomerOwnership("person", { userId: "other" }), "foreign");
});
