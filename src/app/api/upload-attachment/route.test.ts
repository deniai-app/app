import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { session: { userId: "user" }, user: { isAnonymous: false } } as unknown,
  allowed: true,
  uploadFile: vi.fn(async (_file: File) => "https://files.example/upload"),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => mocks.session } } }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () =>
    mocks.allowed ? { allowed: true } : { allowed: false, retryAfter: 60 },
}));
vi.mock("@/lib/upload", () => ({ uploadFile: mocks.uploadFile }));

import { POST } from "./route";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function upload(bytes: Uint8Array<ArrayBuffer>, type: string) {
  const body = new FormData();
  body.set("file", new File([bytes], "attachment", { type }));
  return POST(new Request("https://app.example/api/upload-attachment", { method: "POST", body }));
}

beforeEach(() => {
  mocks.session = { session: { userId: "user" }, user: { isAnonymous: false } };
  mocks.allowed = true;
  mocks.uploadFile.mockClear();
});

test("rejects files whose contents are not an allowed type", async () => {
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  const response = await upload(html, "image/png");
  expect(response.status).toBe(415);
  expect(mocks.uploadFile).not.toHaveBeenCalled();
});

test("stores a file under the type its contents prove", async () => {
  const response = await upload(PNG, "image/jpeg");
  expect(response.status).toBe(200);
  expect(mocks.uploadFile.mock.calls[0]?.[0].type).toBe("image/png");
});

test("rate-limits uploads per account", async () => {
  mocks.allowed = false;
  const response = await upload(PNG, "image/png");
  expect(response.status).toBe(429);
  expect(mocks.uploadFile).not.toHaveBeenCalled();
});
