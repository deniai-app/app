/** Types `/api/upload-attachment` accepts as-is. */
const UPLOADABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const HEIC_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const HEIC_EXTENSION = /\.(heic|heif)$/i;
const IMAGE_EXTENSION = /\.(gif|avif|bmp|heic|heif)$/i;

const JPEG_QUALITY = 0.92;

function isHeic(file: File) {
  return HEIC_TYPES.has(file.type) || HEIC_EXTENSION.test(file.name);
}

/** Images the server rejects but a browser may be able to re-encode. */
function isConvertibleImage(file: File) {
  if (UPLOADABLE_TYPES.has(file.type)) return false;
  // Some OSes report HEIC (and others) with an empty type, so fall back to the extension.
  return file.type.startsWith("image/") || IMAGE_EXTENSION.test(file.name);
}

function renameWithExtension(name: string, extension: string) {
  const base = name.replace(/\.[^./\\]+$/, "") || "image";
  return `${base}.${extension}`;
}

async function encodeBitmap(bitmap: ImageBitmap, type: "image/jpeg" | "image/png") {
  const quality = type === "image/jpeg" ? JPEG_QUALITY : undefined;

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type, quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error("Image encoding failed.");
  return blob;
}

/**
 * Re-encode images the server does not accept (HEIC/HEIF, GIF, AVIF, BMP) as
 * JPEG or PNG before upload. Decoding uses the browser's own codecs, so HEIC
 * only converts where the browser can read it (Safari); elsewhere this throws
 * a message the user can act on. Files that are already uploadable, and
 * non-images, pass through untouched and are judged by the server.
 */
export async function prepareAttachmentForUpload(file: File): Promise<File> {
  if (!isConvertibleImage(file)) return file;

  const heic = isHeic(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      heic
        ? "This browser can't read HEIC images. Please convert it to JPEG or PNG."
        : "This image format isn't supported. Please use JPEG, PNG, WebP or PDF.",
    );
  }

  try {
    // Photos (HEIC) go to JPEG to stay small; everything else to PNG to keep transparency.
    const type = heic ? "image/jpeg" : "image/png";
    const blob = await encodeBitmap(bitmap, type);
    return new File([blob], renameWithExtension(file.name, heic ? "jpg" : "png"), { type });
  } finally {
    bitmap.close();
  }
}
