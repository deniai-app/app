import { UTApi } from "uploadthing/server";
import { env } from "@/env";

let utapi: UTApi | null = null;

if (env.UPLOADTHING_TOKEN) {
  utapi = new UTApi();
}

/**
 * Upload a file to UploadThing.
 * Returns the public URL, or null if UploadThing is not configured.
 */
export async function uploadFile(file: File): Promise<string | null> {
  if (!utapi) return null;

  try {
    const response = await utapi.uploadFiles(file);

    if (response.error) {
      console.error("[upload] UploadThing error:", response.error);
      return null;
    }

    return response.data.ufsUrl;
  } catch (error) {
    console.error("[upload] Failed to upload file:", error);
    return null;
  }
}
