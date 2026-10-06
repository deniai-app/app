/** Translated lookup tables built by `useLocalizeError`. */
export type ErrorDictionary = {
  /** better-auth, passkey and team plugin error codes. */
  byCode: Record<string, string>;
  /** Exact English messages the server sends (tRPC and route handlers). */
  byMessage: Record<string, string>;
  /** Messages with a variable part, rebuilt from the regex's captured values. */
  patterns: { pattern: RegExp; format: (match: RegExpMatchArray) => string }[];
  /** tRPC codes, used only when the server sent no message of its own. */
  byTrpcCode: Record<string, string>;
  network: string;
  invalidInput: string;
};

type ErrorInfo = {
  code?: string;
  message?: string;
  /** Set for tRPC client errors, whose `data.code` is an HTTP-style code. */
  trpc: boolean;
  zod: boolean;
};

const NETWORK_ERROR =
  /^(failed to fetch|load failed|networkerror|network request failed|fetch failed)/i;

/** Own-property lookup, so keys like `constructor` never resolve to `Object.prototype` members. */
function lookup(table: Record<string, string>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Maps `text` to each of `keys`: lets several codes share one translation. */
export function mapKeys(text: string, ...keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, text]));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function looksLikeZodIssues(message: string) {
  if (!message.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(message);
    return Array.isArray(parsed) && parsed.every((issue) => isRecord(issue) && "message" in issue);
  } catch {
    return false;
  }
}

function readErrorInfo(error: unknown): ErrorInfo {
  if (typeof error === "string") {
    return { message: readString(error), trpc: false, zod: false };
  }
  if (!isRecord(error)) {
    return { trpc: false, zod: false };
  }

  // better-auth results wrap the failure as `{ data: null, error: { code, message } }`,
  // and its client throws a BetterFetchError (an Error) carrying the same `.error`.
  if (isRecord(error.error)) {
    return readErrorInfo(error.error);
  }

  const data = isRecord(error.data) ? error.data : undefined;
  const trpcCode = readString(data?.code);
  const message = readString(error.message);

  return {
    code: trpcCode ?? readString(error.code),
    message,
    trpc: trpcCode !== undefined,
    zod: Boolean(data?.zodError) || (message !== undefined && looksLikeZodIssues(message)),
  };
}

/**
 * Turn an error from better-auth, tRPC, a route handler or the network into
 * a message in the user's language. Unknown messages are returned unchanged
 * so no detail is lost.
 */
export function resolveErrorMessage(
  error: unknown,
  dictionary: ErrorDictionary,
  fallback?: string,
): string {
  const { code, message, trpc, zod } = readErrorInfo(error);

  if (zod) return dictionary.invalidInput;

  if (message) {
    const trimmed = message.trim();
    const byMessage = lookup(dictionary.byMessage, trimmed);
    if (byMessage) return byMessage;

    for (const { pattern, format } of dictionary.patterns) {
      const match = trimmed.match(pattern);
      if (match) return format(match);
    }
  }

  if (trpc) {
    // tRPC fills `message` with the code when the server gave none.
    if (code && (!message || message === code)) {
      const byTrpcCode = lookup(dictionary.byTrpcCode, code);
      if (byTrpcCode) return byTrpcCode;
    }
  } else if (code) {
    const byCode = lookup(dictionary.byCode, code);
    if (byCode) return byCode;
  }

  if (message && NETWORK_ERROR.test(message)) return dictionary.network;

  return message ?? fallback ?? "";
}
