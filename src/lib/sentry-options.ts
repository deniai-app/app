import { consoleLoggingIntegration, type ErrorEvent, type init, type Log } from "@sentry/nextjs";

type SentryOptions = NonNullable<Parameters<typeof init>[0]>;
type BeforeSendSpan = NonNullable<SentryOptions["beforeSendSpan"]>;

/** Share of requests that produce a trace. Keep low: chat requests fan out into many spans. */
const TRACES_SAMPLE_RATE = 0.1;

/**
 * Span attributes that can carry prompts, model output, request headers, or query strings.
 * Matched by prefix so SDK-version renames (`gen_ai.*`, `ai.*`, `http.request.header.*`) stay covered.
 */
const SENSITIVE_ATTRIBUTE_PREFIXES = [
  "gen_ai.input",
  "gen_ai.output",
  "gen_ai.prompt",
  "gen_ai.request.messages",
  "gen_ai.response.text",
  "gen_ai.response.object",
  "gen_ai.system_instructions",
  "gen_ai.tool.input",
  "gen_ai.tool.output",
  "gen_ai.tool.call.arguments",
  "gen_ai.tool.call.result",
  "ai.prompt",
  "ai.response",
  "ai.toolCall.args",
  "ai.toolCall.result",
  "http.request.header.",
  "http.response.header.",
  "http.query",
  "url.query",
  "url.full",
  "http.url",
];

/** Drops request payloads so prompts, attachments, and form data never leave the app. */
function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
  }
  return event;
}

const scrubSpan: BeforeSendSpan = (span) => {
  for (const key of Object.keys(span.attributes)) {
    if (SENSITIVE_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      delete span.attributes[key];
    }
  }
  return span;
};

/** Logs carry only the message and structured attributes the app chose to emit. */
function scrubLog(log: Log): Log {
  if (!log.attributes) {
    return log;
  }
  const attributes = { ...log.attributes };
  for (const key of Object.keys(attributes)) {
    if (SENSITIVE_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      delete attributes[key];
    }
  }
  return { ...log, attributes };
}

/**
 * Shared Sentry options for server and browser: errors, structured logs
 * (`Sentry.logger` plus console warn/error), and sampled traces. No session
 * replay and no default PII (Sentry default). Sentry stays disabled until
 * NEXT_PUBLIC_SENTRY_DSN is set and NODE_ENV is production.
 */
export function getSentryOptions(): SentryOptions {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  return {
    dsn: dsn || undefined,
    enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
    tracesSampleRate: TRACES_SAMPLE_RATE,
    ignoreErrors: [
      "AbortError",
      "The operation was aborted",
      // Injected by Safari/in-app browsers or extensions that parse JSON-LD; not our code.
      /\["@context"\]\.toLowerCase/,
      // Globals referenced by scripts that in-app browsers and extensions inject.
      /Can't find variable: CONFIG/,
      /window\.webkit\.messageHandlers/,
      // DOM rewritten under React by page translators or extensions.
      /Failed to execute 'removeChild' on 'Node'/,
      /The object can not be found here/,
      // WebExtension messaging from a closed tab; the app never calls runtime.sendMessage.
      /Invalid call to runtime\.sendMessage\(\)/,
      // Transient network failures and blocked third-party scripts.
      /^TypeError: Load failed$/,
      /^Load failed$/,
      /Failed to load Stripe\.js/,
      // Service worker fetch failures (offline, deploy in progress, bots).
      /Failed to update a ServiceWorker/,
      /Script https?:\/\/\S+\/sw\.js load failed/,
      // Scanner bots POSTing to unknown paths (e.g. /index.php) or replaying stale Server Actions.
      /Failed to find Server Action/,
      /Body exceeded 1 MB limit/,
      /Failed to parse body as FormData/,
      // Desktop shell denies its opener plugin for external links; not raised by app code.
      /not allowed by ACL/,
      // Expected tool failure that is already reported back to the model and the user.
      /^Error: Web search timed out/,
    ],
    // Extension and in-app browser scripts that are not part of the app bundle.
    denyUrls: [
      /^app:\/\/\/executors\//,
      /\/executors\/\d+\.js/,
      // Injected scripts reported under a bare name or the page path instead of a bundle chunk.
      /^app:\/\/\/(compare|chat\/[0-9a-f-]{36})$/,
      /^(chrome|moz|safari(-web)?)-extension:\/\//,
    ],
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeSendLog: scrubLog,
    integrations: [consoleLoggingIntegration({ levels: ["warn", "error"] })],
  };
}
