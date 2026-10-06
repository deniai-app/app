import type { UIMessage } from "ai";
import {
  decodeTextAttachment,
  isTextMediaType,
  textMediaTypeForName,
} from "@/lib/attachment-types";

/** Characters of one file sent to the model; longer files are cut with a notice. */
const MAX_INLINE_CHARS = 400_000;
const FETCH_TIMEOUT_MS = 10_000;
/** Text uploads are capped at 2 MB; allow a little slack for encodings. */
const MAX_FETCH_BYTES = 2 * 1024 * 1024 + 1024;

type MessagePart = UIMessage["parts"][number];
type FilePart = Extract<MessagePart, { type: "file" }>;

/**
 * Only files this app stored are fetched. Message parts come from the client,
 * so any other URL would let a user make the server request arbitrary hosts.
 */
function isStoredAttachmentHost(url: URL) {
  return (
    url.protocol === "https:" &&
    (url.hostname === "utfs.io" || url.hostname === "ufs.sh" || url.hostname.endsWith(".ufs.sh"))
  );
}

function readDataUrl(url: string): Uint8Array | null {
  const comma = url.indexOf(",");
  if (comma === -1) return null;
  const meta = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  try {
    return meta.includes(";base64")
      ? new Uint8Array(Buffer.from(payload, "base64"))
      : new TextEncoder().encode(decodeURIComponent(payload));
  } catch {
    return null;
  }
}

async function readAttachmentBytes(url: string): Promise<Uint8Array | null> {
  if (url.startsWith("data:")) return readDataUrl(url);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!isStoredAttachmentHost(parsed)) return null;

  try {
    const response = await fetch(parsed, {
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_FETCH_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > MAX_FETCH_BYTES ? null : bytes;
  } catch {
    return null;
  }
}

function safeName(name: string | undefined) {
  return (name || "attachment").replace(/["<>\r\n]/g, "_");
}

export function formatTextAttachment(name: string | undefined, text: string | null) {
  const label = safeName(name);
  if (text === null) {
    return `[Attached file "${label}" could not be read.]`;
  }
  const truncated = text.length > MAX_INLINE_CHARS;
  const body = truncated ? text.slice(0, MAX_INLINE_CHARS) : text;
  const notice = truncated
    ? `\n[Truncated: only the first ${MAX_INLINE_CHARS.toLocaleString("en-US")} characters are shown.]`
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

/**
 * Models take images and PDFs as file parts but not text files, so text
 * attachments in user messages are replaced by their contents. Stored
 * messages are left as they are; this only shapes what the model receives.
 */
export async function inlineTextAttachments(messages: UIMessage[]): Promise<UIMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      if (message.role !== "user" || !message.parts.some(isTextFilePart)) {
        return message;
      }
      const parts = await Promise.all(
        message.parts.map(async (part): Promise<MessagePart> => {
          if (!isTextFilePart(part)) return part;
          const bytes = await readAttachmentBytes(part.url);
          const text = bytes ? decodeTextAttachment(bytes) : null;
          return { type: "text", text: formatTextAttachment(part.filename, text) };
        }),
      );
      return { ...message, parts };
    }),
  );
}
