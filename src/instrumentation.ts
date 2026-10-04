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
}

export const onRequestError = Sentry.captureRequestError;
