import type { Experimental_DownloadFunction as DownloadFunction, UIMessage } from "ai";
import { fetchSafePublicHttpUrl, isBlockedHostnameLiteral } from "@/lib/network-security";

export const MAX_CHAT_BINARY_ATTACHMENTS = 20;
export const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_CONCURRENT_DOWNLOADS = 4;

/** Bound binary history just as text history is bounded before entering the SDK. */
export function prepareBinaryAttachments(messages: UIMessage[]): UIMessage[] {
  const files = messages.flatMap((message) => message.parts.filter((part) => part.type === "file"));
  const kept = new Set(files.slice(-MAX_CHAT_BINARY_ATTACHMENTS));
  let inlineBytes = 0;
  for (const file of kept) {
    if (!file.mediaType.startsWith("image/") && file.mediaType !== "application/pdf")
      throw new Error("Unsupported attachment type.");
    if (file.url.startsWith("data:")) {
      const comma = file.url.indexOf(",");
      const metadata = file.url.slice(0, comma);
      const payload = file.url.slice(comma + 1);
      if (
        comma < 0 ||
        !metadata.endsWith(";base64") ||
        payload.length > 4 * Math.ceil(MAX_CHAT_ATTACHMENT_BYTES / 3)
      )
        throw new Error("Attachment is too large or invalid.");
      inlineBytes += Buffer.byteLength(payload, "base64");
      if (inlineBytes > MAX_TOTAL_BYTES) throw new Error("Attachments are too large.");
    } else {
      const url = new URL(file.url);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        isBlockedHostnameLiteral(url.hostname)
      )
        throw new Error("Invalid attachment URL.");
    }
  }
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === "file" && !kept.has(part)
        ? {
            type: "text" as const,
            text: "[An older attachment was left out: at most 20 binary attachments can be sent per request.]",
          }
        : part,
    ),
  }));
}

/** Keep connect-time SSRF protection, cap bytes, and share downloads across provider steps. */
export function createChatAttachmentDownload(signal: AbortSignal): DownloadFunction {
  const cache = new Map<string, { data: Uint8Array; mediaType: string | undefined }>();
  let totalBytes = 0;
  return async (requested) => {
    if (requested.length > MAX_CHAT_BINARY_ATTACHMENTS) throw new Error("Too many attachments.");
    const urls = [...new Map(requested.map(({ url }) => [url.href, url])).values()];
    let next = 0;
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
    async function download(url: URL) {
      if (cache.has(url.href)) return;
      let target = url;
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 5; redirects++) {
        response = await fetchSafePublicHttpUrl(target.href, { signal: timeout });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirects === 5) throw new Error("Invalid attachment redirect.");
        target = new URL(location, target);
      }
      if (!response?.ok || !response.body) {
        await response?.body?.cancel();
        throw new Error("Attachment download failed.");
      }
      if (Number(response.headers.get("content-length")) > MAX_CHAT_ATTACHMENT_BYTES) {
        await response.body.cancel();
        throw new Error("Attachment is too large.");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          totalBytes += value.byteLength;
          if (size > MAX_CHAT_ATTACHMENT_BYTES || totalBytes > MAX_TOTAL_BYTES)
            throw new Error("Attachments are too large.");
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
      } finally {
        reader.releaseLock();
      }
      const data = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.byteLength;
      }
      cache.set(url.href, {
        data,
        mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? undefined,
      });
    }
    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT_DOWNLOADS, urls.length) }, async () => {
        while (next < urls.length) await download(urls[next++]);
      }),
    );
    return requested.map(({ url }) => cache.get(url.href)!);
  };
}
