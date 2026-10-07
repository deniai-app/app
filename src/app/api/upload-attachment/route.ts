import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  decodeTextAttachment,
  MAX_TEXT_ATTACHMENT_BYTES,
  textMediaTypeForName,
} from "@/lib/attachment-types";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { uploadFile } from "@/lib/upload";
import { guardMutationRequest } from "@/lib/mutation-request";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
// Multipart boundaries and headers add a little on top of the file itself.
const MAX_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + 64 * 1024;
const UPLOAD_WINDOW_MS = 10 * 60_000;

function asciiAt(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The browser-supplied MIME type is only a claim; detect it from the file itself. */
function detectAttachmentType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return "image/png";
  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 12) === "WEBP") return "image/webp";
  if (asciiAt(bytes, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

/**
 * Read the request body, stopping at the size cap. Content-Length can be absent
 * (chunked uploads) or wrong, so it cannot be the only guard before the body is buffered.
 */
async function readBodyWithinLimit(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

export async function POST(request: Request) {
  const rejected = guardMutationRequest(request, "multipart/form-data");
  if (rejected) return rejected;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = await checkRateLimit({
    key: `upload-attachment:${session.session.userId}`,
    windowMs: UPLOAD_WINDOW_MS,
    maxRequests: session.user.isAnonymous ? 10 : 60,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } },
    );
  }

  // Reject oversized bodies before formData() buffers them in memory.
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Attachment is too large." }, { status: 413 });
  }

  const body = await readBodyWithinLimit(request);
  if (!body) {
    return NextResponse.json({ error: "Attachment is too large." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }
  const submittedFile = formData.get("file");

  if (!(submittedFile instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }

  if (submittedFile.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "Attachment is too large." }, { status: 413 });
  }

  // The claimed type is not checked: browsers and OSes report it inconsistently
  // (empty, `image/jpg`, `application/octet-stream`), and the contents decide.
  const detectedType = detectAttachmentType(
    new Uint8Array(await submittedFile.slice(0, 16).arrayBuffer()),
  );

  let uploadedFile: File;
  if (detectedType) {
    // Store and serve the file under the type its contents prove, not the claimed one.
    uploadedFile =
      detectedType === submittedFile.type
        ? submittedFile
        : new File([submittedFile], submittedFile.name, { type: detectedType });
  } else {
    // No magic bytes: accept plain-text files by extension, provided they really decode as text.
    const textType = textMediaTypeForName(submittedFile.name);
    if (!textType) {
      console.warn(
        `[upload-attachment] unsupported content (claimed type: ${submittedFile.type || "none"}, size: ${submittedFile.size})`,
      );
      return NextResponse.json({ error: "Unsupported attachment type." }, { status: 415 });
    }
    if (submittedFile.size > MAX_TEXT_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "Text file is too large (max 2 MB)." }, { status: 413 });
    }
    const text = decodeTextAttachment(new Uint8Array(await submittedFile.arrayBuffer()));
    if (text === null) {
      console.warn(`[upload-attachment] binary content in text file (size: ${submittedFile.size})`);
      return NextResponse.json({ error: "Unsupported attachment type." }, { status: 415 });
    }
    // Always stored as UTF-8, whatever encoding the file arrived in.
    uploadedFile = new File([text], submittedFile.name, { type: textType });
  }

  let url: string | null = null;
  try {
    url = await uploadFile(uploadedFile);
  } catch (error) {
    console.error("Attachment upload failed", error);
  }

  // When UploadThing is not configured (or the upload failed), fall back to an
  // inline base64 data URL so attachments still work. Keep the fallback smaller
  // than maxBytes so chat history / response payloads stay within limits.
  const maxDataUrlBytes = 512 * 1024;
  if (!url) {
    if (uploadedFile.size > maxDataUrlBytes) {
      console.error(
        `[upload-attachment] storage unavailable and file exceeds inline fallback (size: ${uploadedFile.size})`,
      );
      return NextResponse.json(
        {
          error:
            "Attachment upload failed. Inline fallback is limited to 512KB when storage is unavailable.",
        },
        { status: 500 },
      );
    }
    try {
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      url = `data:${uploadedFile.type};base64,${base64}`;
    } catch (error) {
      console.error("Attachment base64 fallback failed", error);
      return NextResponse.json({ error: "Attachment upload failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ url, mediaType: uploadedFile.type });
}
