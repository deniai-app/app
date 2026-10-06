import { prepareAttachmentForUpload } from "@/lib/attachment-image";

export type UploadedAttachment = {
  /** The file that was uploaded; differs from the input when it was converted. */
  file: File;
  url: string;
  /** The type the server stored the file under (it may normalize the claimed one). */
  mediaType?: string;
};

/**
 * Upload an attachment from the browser. Images the server rejects (HEIC, GIF,
 * ...) are re-encoded first, so every caller gets the same conversion.
 */
export async function uploadAttachmentFile(original: File): Promise<UploadedAttachment> {
  const file = await prepareAttachmentForUpload(original);
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch("/api/upload-attachment", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    mediaType?: string;
    url?: string;
  };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error || "Attachment upload failed.");
  }

  return { file, url: payload.url, mediaType: payload.mediaType };
}
