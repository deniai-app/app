# Security and correctness audit — 2026-10-07

Implementation: Claude Opus 5.5 with medium effort, invoked through the installed
Claude CLI. Findings and patches were independently reviewed, with additional
reproduction probes and regression checks. Changes remain in the working tree.

This audit fixes 12 distinct application defects. Severity is a qualitative
assessment of the observed impact, not a CVSS score or a claim of complete coverage.

| #   | Severity   | Defect and reproduction                                                                                                                                                          | Resulting behavior                                                                                                                                                                                 | Regression coverage                                                                                     |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | High       | Replay `billing.confirmCheckout` with a lifetime checkout after its charge was refunded or disputed. Stripe still reports the session as paid.                                   | Check the live charge under the same account lock as reversal handling; reversed payments, including a reversal racing confirmation, cannot restore the revoked plan.                              | `src/server/api/routers/billing-confirm-checkout.test.ts`                                               |
| 2   | High       | A public URL returns status 600 or an invalid response header. Response construction throws in an asynchronous socket callback and escapes the request promise.                  | Validate status and catch response construction errors, destroy both streams, and reject the request.                                                                                              | `src/lib/network-security.test.ts`; isolated Node reproduction before and after the fix                 |
| 3   | High       | Account A signs out and B signs in through SPA navigation. Shared query keys return A's fresh cached chats or auth session, or an A request/callback completes after the switch. | Track account ownership across provider mounts, discard previous-account queries and responses, reject stale asynchronous cache writes, and remount private component state when identity changes. | `src/lib/account-query-boundary.test.ts`; independent cache and late-mutation reproductions             |
| 4   | Medium     | Admin reward approval succeeds, then the credit write fails. Retrying no longer matches a pending reward.                                                                        | Approval and credit increment commit together; a failure leaves the reward retryable.                                                                                                              | `src/lib/affiliate-milestones.test.ts`                                                                  |
| 5   | Medium     | Six referral claims insert before counting; all choose milestone 2, leaving milestone 1 missing.                                                                                 | Serialize milestone accounting per referrer and award the lowest missing eligible milestone, preserving fraud review.                                                                              | `src/lib/affiliate-milestones.test.ts`                                                                  |
| 6   | Medium     | Delete a team whose subscription is unpaid, paused, or incomplete. The former cancellation list skipped these resumable subscriptions.                                           | Cancel every nonterminal subscription before deleting its billing records; cancellation failure blocks deletion.                                                                                   | `src/lib/team-billing-deletion.test.ts`                                                                 |
| 7   | Medium     | Import 14,000 small chats, below the payload size cap. A single statement requires 70,000 bound parameters, exceeding the installed driver's limit.                              | Insert bounded batches in one transaction, preserving all-or-nothing import behavior.                                                                                                              | `src/server/api/routers/migration.test.ts`; independent SQL parameter-count probe                       |
| 8   | Low–Medium | Import titles or message strings containing U+0000. PostgreSQL text/JSONB rejects them.                                                                                          | Normalize those strings using the shared NUL sanitizer before inserting.                                                                                                                           | `src/server/api/routers/migration.test.ts`                                                              |
| 9   | Medium     | A stop request reads a generation while a new generation starts or the old partial answer advances. An unconditional update or stale transcript snapshot overwrites newer state. | Guard the stop by captured generation ID, remove the pending flag from the current JSONB row atomically, and abort only that generation locally.                                                   | `src/lib/chat-stop.test.ts`; `tools/chat-settlement-regressions.test.ts`                                |
| 10  | Medium     | Team membership is revoked after the project creation check but before insertion.                                                                                                | Lock the membership row in the insertion transaction; earlier revocation is denied and concurrent removal waits for the authorized insertion.                                                      | `src/server/api/routers/projects-create.test.ts`                                                        |
| 11  | Low–Medium | Fetch many distinct empty text attachments. Counting only text characters never evicts zero-length entries.                                                                      | Include URL length and per-entry overhead in the budget and cap the cache at 500 entries.                                                                                                          | `src/lib/chat-text-attachments.test.ts`                                                                 |
| 12  | Medium     | A completed, paid lifetime checkout has no PaymentIntent after a full discount. Saving the entitlement rejects it; recovery after a temporary subscription also skips it.        | Accept the paid session with no charge to reverse, both when saving and recovering lifetime purchases. Unpaid or reversed purchases remain excluded.                                               | `src/server/api/routers/billing-confirm-checkout.test.ts`; `src/lib/lifetime-purchase-recovery.test.ts` |

Account changes retain same-account state during ordinary session refreshes. Chat
stops preserve the latest saved partial answer. Import batches share one transaction,
and neither the payload cap nor entitlement and quota rules are increased. No schema
or environment changes are required.

If private queries ran before the initial session resolved, the boundary discards
that unowned data and remounts once. This can cause an extra initial fetch. Public
pages still server-render, and ordinary refreshes of the same account retain state.

The discounted-order case follows Stripe's documented contract that completed
no-cost Checkout sessions do not have a PaymentIntent. Coverage here concerns the
`payment_status: "paid"`, `payment_intent: null` case; other payment statuses were
not broadened. See [Stripe's no-cost orders guide](https://docs.stripe.com/payments/checkout/no-cost-orders.md?payment-ui=stripe-hosted).

## Verification

- `pnpm test --reporter=dot`: 100 files / 624 tests passed (baseline: 92 / 571).
- `pnpm run typecheck`: passed after fixing the new test's mutation variable argument.
- `pnpm run lint`: zero errors; eight existing unused-code warnings in unrelated files.
- `pnpm run format`: completed; the unrelated generated migration snapshot formatting
  was restored. No schema or migration change remains.
- `pnpm run build`: passed, including TypeScript and generation of 88 pages. Sentry
  source-map upload and Next telemetry were disabled for this local check through
  process-only environment overrides.
- Final development-server smoke checks: `/home` and `/auth/sign-in` returned 200
  with server-rendered `<main>` content; cross-origin POSTs to `/api/chat/stop` and
  `/api/trpc/billing.confirmCheckout` returned 403. A retained development-server
  child initially hung on the page check; restarting that task-owned server
  resolved it without a source change.
- `git diff --check`: passed. The remote-status-600 reproduction now rejects safely.

The baseline suite passed 92 files / 571 tests. Independent probes established the
original HTTP exception, cross-account cache reuse, and excessive import parameter
count. Database and Stripe regression tests use controlled fakes; they do not prove
behavior against a deployed PostgreSQL/Stripe environment. Authenticated browser
account switching has not been exercised with real accounts. No live billing writes,
messages, migrations, commits, pushes, or deployments were performed.

## Remaining dependency finding

`pnpm audit --prod` reported zero advisories. The full audit reported one high-severity
development-only advisory: `braces@3.0.3`, brought in by `shadcn`, can exhaust the stack
on deeply nested patterns. No patched release was listed at audit time. Dependencies
were left unchanged; revisit the development tooling when an upstream fix is available.
Source: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Product-policy questions, such as team trial seat growth, were not counted as confirmed
defects. This audit does not establish that the application has no other vulnerabilities.
