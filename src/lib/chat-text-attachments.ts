import type { UIMessage } from "ai";
import { env } from "@/env";
import {
  decodeTextAttachment,
  isTextMediaType,
  textMediaTypeForName,
} from "@/lib/attachment-types";

/** Characters of one file sent to the model; longer files are cut with a notice. */
const MAX_INLINE_CHARS = 400_000;
/** Characters of all attachments in one request, so several files cannot overflow the context window. */
const MAX_TOTAL_INLINE_CHARS = 400_000;
/** Text attachments read per request; the oldest beyond this are left out. */
const MAX_ATTACHMENTS_PER_REQUEST = 20;
const MAX_CONCURRENT_FETCHES = 4;
const FETCH_TIMEOUT_MS = 10_000;
/** Text uploads are capped at 2 MB; allow a little slack for encodings. */
const MAX_FETCH_BYTES = 2 * 1024 * 1024 + 1024;
/** Decoded text by stored URL: stored files never change, and history is re-sent every turn. */
const MAX_CACHED_CHARS = 2_000_000;
/** Larger files are not worth the memory; they are fetched again when needed. */
const MAX_CACHED_FILE_CHARS = 200_000;

type MessagePart = UIMessage["parts"][number];
type FilePart = Extract<MessagePart, { type: "file" }>;

/** Entries kept regardless of size: empty files would otherwise cost nothing. */
const MAX_CACHED_ENTRIES = 500;
/** Rough per-entry Map overhead, so tiny files with long URLs still count. */
const CACHE_ENTRY_OVERHEAD_CHARS = 64;

const textCache = new Map<string, string>();
let cachedChars = 0;

function cacheCost(url: string, text: string) {
  return url.length + text.length + CACHE_ENTRY_OVERHEAD_CHARS;
}

function cacheText(url: string, text: string) {
  if (text.length > MAX_CACHED_FILE_CHARS) return;
  const previous = textCache.get(url);
  if (previous !== undefined) cachedChars -= cacheCost(url, previous);
  textCache.delete(url);
  textCache.set(url, text);
  cachedChars += cacheCost(url, text);
  for (const [oldestUrl, oldest] of textCache) {
    if (cachedChars <= MAX_CACHED_CHARS && textCache.size <= MAX_CACHED_ENTRIES) break;
    textCache.delete(oldestUrl);
    cachedChars -= cacheCost(oldestUrl, oldest);
  }
}

/** UploadThing app id from the server token, or `null` when uploads are not configured. */
function storedAttachmentHostname(): string | null {
  const token = env.UPLOADTHING_TOKEN;
  if (!token) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const appId =
      typeof decoded === "object" && decoded !== null && "appId" in decoded ? decoded.appId : null;
    return typeof appId === "string" && /^[a-z0-9]+$/i.test(appId)
      ? `${appId.toLowerCase()}.ufs.sh`
      : null;
  } catch {
    return null;
  }
}

/**
 * Only files this app stored are fetched. Message parts come from the client,
 * so any other URL (including another UploadThing app's) would let a user make
 * the server request hosts of their choosing.
 */
function isStoredAttachmentUrl(url: URL) {
  const hostname = storedAttachmentHostname();
  return (
    hostname !== null &&
    url.protocol === "https:" &&
    url.hostname === hostname &&
    url.pathname.startsWith("/f/")
  );
}

function readDataUrl(url: string): Uint8Array | null {
  const comma = url.indexOf(",");
  if (comma === -1) return null;
  const meta = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  // Base64 is a third larger than the bytes it carries, and percent-encoding up to three times.
  if (payload.length > MAX_FETCH_BYTES * 3) return null;
  try {
    const bytes = meta.includes(";base64")
      ? new Uint8Array(Buffer.from(payload, "base64"))
      : new TextEncoder().encode(decodeURIComponent(payload));
    return bytes.length > MAX_FETCH_BYTES ? null : bytes;
  } catch {
    return null;
  }
}

/** Read a response body, giving up as soon as it passes the size cap. */
async function readCappedBody(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_FETCH_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function readAttachmentBytes(url: string): Promise<Uint8Array | null> {
  if (url.startsWith("data:")) return readDataUrl(url);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!isStoredAttachmentUrl(parsed)) return null;

  try {
    const response = await fetch(parsed, {
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_FETCH_BYTES) return null;
    return await readCappedBody(response);
  } catch {
    return null;
  }
}

async function readAttachmentText(url: string): Promise<string | null> {
  const cached = textCache.get(url);
  if (cached !== undefined) {
    cacheText(url, cached);
    return cached;
  }
  const bytes = await readAttachmentBytes(url);
  const text = bytes ? decodeTextAttachment(bytes) : null;
  // data: URLs already travel with the request; only fetched files are worth keeping.
  if (text !== null && !url.startsWith("data:")) cacheText(url, text);
  return text;
}

function safeName(name: string | undefined) {
  return (name || "attachment").replace(/["<>\r\n]/g, "_");
}

export function formatTextAttachment(
  name: string | undefined,
  text: string | null,
  maxChars = MAX_INLINE_CHARS,
) {
  const label = safeName(name);
  if (text === null) {
    return `[Attached file "${label}" could not be read.]`;
  }
  if (maxChars <= 0) {
    return `[Attached file "${label}" was left out: the attachments in this chat are too long.]`;
  }
  const truncated = text.length > maxChars;
  const body = truncated ? text.slice(0, maxChars) : text;
  const notice = truncated
    ? `\n[Truncated: only the first ${maxChars.toLocaleString("en-US")} characters are shown.]`
    : "";
  return `<attached_file name="${label}">\n${body}${notice}\n</attached_file>`;
}

function isTextFilePart(part: MessagePart): part is FilePart {
  if (part.type !== "file") return false;
  const mediaType = part.mediaType ?? "";
  if (isTextMediaType(mediaType)) return true;
  // The browser's claimed type can be empty; the stored file name still says what it is.
  const isBinaryType = mediaType.startsWith("image/") || mediaType === "application/pdf";
  return !isBinaryType && textMediaTypeForName(part.filename ?? "") !== null;
}

/** Run `task` over `items` with at most `limit` in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length });
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Models take images and PDFs as file parts but not text files, so text
 * attachments in user messages are replaced by their contents. Stored
 * messages are left as they are; this only shapes what the model receives.
 *
 * The newest attachments win when a request carries more than fits: older
 * ones are shortened or left out rather than failing the whole request.
 */
export async function inlineTextAttachments(messages: UIMessage[]): Promise<UIMessage[]> {
  const refs: { message: number; part: number; file: FilePart }[] = [];
  messages.forEach((message, messageIndex) => {
    if (message.role !== "user") return;
    message.parts.forEach((part, partIndex) => {
      if (isTextFilePart(part)) refs.push({ message: messageIndex, part: partIndex, file: part });
    });
  });
  if (refs.length === 0) return messages;

  // Newest first, so the budget and the per-request cap favor the latest files.
  const newestFirst = refs.toReversed();
  const read = newestFirst.slice(0, MAX_ATTACHMENTS_PER_REQUEST);
  const texts = new Map<string, Promise<string | null>>();
  const loaded = await mapWithConcurrency(read, MAX_CONCURRENT_FETCHES, (ref) => {
    let text = texts.get(ref.file.url);
    if (!text) {
      text = readAttachmentText(ref.file.url);
      texts.set(ref.file.url, text);
    }
    return text;
  });

  const replacements = new Map<MessagePart, MessagePart>();
  let budget = MAX_TOTAL_INLINE_CHARS;
  newestFirst.forEach((ref, index) => {
    const text = index < read.length ? (loaded[index] ?? null) : "";
    const allowed = index < read.length ? Math.min(MAX_INLINE_CHARS, budget) : 0;
    if (text !== null) budget -= Math.min(text.length, allowed);
    replacements.set(ref.file, {
      type: "text",
      text: formatTextAttachment(ref.file.filename, text, allowed),
    });
  });

  return messages.map((message) =>
    message.role === "user" && message.parts.some((part) => replacements.has(part))
      ? { ...message, parts: message.parts.map((part) => replacements.get(part) ?? part) }
      : message,
  );
}
