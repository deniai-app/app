import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { uploadFile } from "@/lib/upload";

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

export async function POST(request: Request) {
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

  const formData = await request.formData();
  const submittedFile = formData.get("file");

  if (!(submittedFile instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }

  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

  if (!allowedTypes.has(submittedFile.type)) {
    return NextResponse.json({ error: "Unsupported attachment type." }, { status: 415 });
  }

  if (submittedFile.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "Attachment is too large." }, { status: 413 });
  }

  const detectedType = detectAttachmentType(
    new Uint8Array(await submittedFile.slice(0, 16).arrayBuffer()),
  );
  if (!detectedType) {
    return NextResponse.json({ error: "Unsupported attachment type." }, { status: 415 });
  }
  // Store and serve the file under the type its contents prove, not the claimed one.
  const uploadedFile =
    detectedType === submittedFile.type
      ? submittedFile
      : new File([submittedFile], submittedFile.name, { type: detectedType });

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

  return NextResponse.json({ url });
}
