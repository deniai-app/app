import { afterEach, expect, test, vi } from "vitest";
import { prepareAttachmentForUpload } from "./attachment-image";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("passes uploadable files and non-images through untouched", async () => {
  const png = new File([new Uint8Array(4)], "a.png", { type: "image/png" });
  const text = new File(["hello"], "a.txt", { type: "text/plain" });

  expect(await prepareAttachmentForUpload(png)).toBe(png);
  expect(await prepareAttachmentForUpload(text)).toBe(text);
});

test("explains HEIC when the browser cannot decode it, even with an empty type", async () => {
  vi.stubGlobal("createImageBitmap", async () => {
    throw new Error("decode failed");
  });
  const heic = new File([new Uint8Array(4)], "IMG_0001.HEIC", { type: "" });

  await expect(prepareAttachmentForUpload(heic)).rejects.toThrow("HEIC");
});

test("re-encodes a decodable GIF as PNG", async () => {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", async () => ({ width: 2, height: 2, close }));
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return { drawImage() {} };
      }
      async convertToBlob({ type }: { type: string }) {
        return new Blob([new Uint8Array(3)], { type });
      }
    },
  );
  const gif = new File([new Uint8Array(4)], "anim.gif", { type: "image/gif" });

  const converted = await prepareAttachmentForUpload(gif);

  expect(converted.type).toBe("image/png");
  expect(converted.name).toBe("anim.png");
  expect(close).toHaveBeenCalled();
});
