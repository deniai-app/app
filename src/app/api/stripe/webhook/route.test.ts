import { expect, test, vi } from "vitest";
import { stripe } from "@/lib/stripe";

vi.mock("@/env", () => ({
  env: { STRIPE_SECRET_KEY: "sk_test_local", STRIPE_WEBHOOK_SECRET: "whsec_local_test" },
}));
vi.mock("@/db/drizzle", () => ({ db: {} }));
vi.mock("@/lib/billing-card-usage", () => ({ getBillingFingerprintUpdates: vi.fn() }));
vi.mock("@/lib/affiliate", () => ({
  isAffiliatePaidStatus: () => false,
  processAffiliatePurchase: vi.fn(),
}));
vi.mock("@/lib/ad-checkout", () => ({
  activatePaidAd: vi.fn(),
  pauseReversedAdCharge: vi.fn(),
  releaseExpiredAdCheckout: vi.fn(),
}));
vi.mock("@/lib/max-mode", () => ({ syncMaxModeMeterPeriod: vi.fn() }));
vi.mock("@/lib/stripe-disputes", () => ({
  handleChargeDisputeClosed: vi.fn(),
  handleChargeDisputeCreated: vi.fn(),
  handleEarlyFraudWarning: vi.fn(),
}));
vi.mock("@/lib/team-billing", () => ({
  cancelOrgMembersPersonalSubscriptions: vi.fn(),
  getTeamBilling: vi.fn(),
  recordTeamAuditEvent: vi.fn(),
}));
vi.mock("@/lib/team-billing-record", () => ({ saveTeamBillingRecord: vi.fn() }));
const { POST } = await import("./route");

test("bounded parsing preserves the exact signed raw bytes", async () => {
  const body =
    '{\n "id": "evt_local", "type": "unused.event", "data": {"object": {"text":"日本語"}}\n}\n';
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: "whsec_local_test",
  });
  expect(
    (
      await POST(
        new Request("http://localhost/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": signature },
          body,
        }),
      )
    ).status,
  ).toBe(200);
});

test("unsigned oversized requests are rejected without body parsing", async () => {
  const req = new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "content-length": "9999999" },
    body: "{}",
  });
  expect((await POST(req)).status).toBe(400);
  expect(req.bodyUsed).toBe(false);
});

test("an invalid signature cannot force oversized body buffering", async () => {
  const req = new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "invalid", "content-length": "9999999" },
    body: "{}",
  });
  expect((await POST(req)).status).toBe(413);
  expect(req.bodyUsed).toBe(false);
});

test("chunked webhook bodies are canceled at the byte cap", async () => {
  let chunks = 0;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunks++ < 6) controller.enqueue(new Uint8Array(1024 * 1024));
      else controller.close();
    },
    cancel,
  });
  const req = new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "invalid", "content-length": "1" },
    body,
    duplex: "half",
  } as RequestInit);
  expect((await POST(req)).status).toBe(413);
  expect(cancel).toHaveBeenCalledOnce();
});
