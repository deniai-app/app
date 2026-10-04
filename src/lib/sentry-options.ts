import type { ErrorEvent, init } from "@sentry/nextjs";

type SentryOptions = NonNullable<Parameters<typeof init>[0]>;

/** Drops request payloads so prompts, attachments, and form data never leave the app. */
function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
  }
  return event;
}

/**
 * Shared Sentry options for server and browser. Error reporting only: no
 * tracing, no session replay, and no default PII (Sentry default). Sentry stays disabled until
 * NEXT_PUBLIC_SENTRY_DSN is set.
 */
export function getSentryOptions(): SentryOptions {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  return {
    dsn: dsn || undefined,
    enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
    tracesSampleRate: 0,
    ignoreErrors: ["AbortError", "The operation was aborted"],
    beforeSend: scrubEvent,
  };
}
