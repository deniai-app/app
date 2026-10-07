import { expect, test, vi } from "vitest";
import { listCustomerSubscriptions, pickLicensedSubscription } from "./stripe-subscriptions";
import { stripe } from "./stripe";
vi.mock("./stripe", () => ({ stripe: { subscriptions: { list: vi.fn() } } }));
test("recent cancellations do not hide an active subscription on a later page", async () => {
  vi.mocked(stripe.subscriptions.list)
    .mockResolvedValueOnce({
      has_more: true,
      data: Array.from({ length: 100 }, (_, i) => ({
        id: `old-${i}`,
        status: "canceled",
        items: { data: [] },
      })),
    } as never)
    .mockResolvedValueOnce({
      has_more: false,
      data: [{ id: "active", status: "active", items: { data: [] } }],
    } as never);
  const subscriptions = await listCustomerSubscriptions("customer");
  expect(pickLicensedSubscription(subscriptions, (status) => status === "active")?.id).toBe(
    "active",
  );
  expect(stripe.subscriptions.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ starting_after: "old-99", customer: "customer" }),
  );
});
