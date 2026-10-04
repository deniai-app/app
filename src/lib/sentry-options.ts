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
    ignoreErrors: [
      "AbortError",
      "The operation was aborted",
      // Globals referenced by scripts that in-app browsers and extensions inject.
      /Can't find variable: CONFIG/,
      /window\.webkit\.messageHandlers/,
      // DOM rewritten under React by page translators or extensions.
      /Failed to execute 'removeChild' on 'Node'/,
      /The object can not be found here/,
      // Transient network failures and blocked third-party scripts.
      /^TypeError: Load failed$/,
      /^Load failed$/,
      /Failed to load Stripe\.js/,
      // Service worker fetch failures (offline, deploy in progress, bots).
      /Failed to update a ServiceWorker/,
      /Script https?:\/\/\S+\/sw\.js load failed/,
    ],
    // Extension and in-app browser scripts that are not part of the app bundle.
    denyUrls: [
      /^app:\/\/\/executors\//,
      /\/executors\/\d+\.js/,
      /^(chrome|moz|safari(-web)?)-extension:\/\//,
    ],
    beforeSend: scrubEvent,
  };
}
