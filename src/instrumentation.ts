import * as Sentry from "@sentry/nextjs";
import { getSentryOptions } from "@/lib/sentry-options";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  Sentry.init(getSentryOptions());
  const { installAbortDiagnostics } = await import("@/lib/abort-diagnostics");
  installAbortDiagnostics();
  // `next dev` would spend provider tokens on every restart; use the cron route there.
  if (process.env.NODE_ENV === "production") {
    const { startModelHealthScheduler } = await import("@/lib/model-health-scheduler");
    startModelHealthScheduler();
  }
}

export const onRequestError = Sentry.captureRequestError;
