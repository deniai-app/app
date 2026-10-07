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

test("accepts a file whose browser-reported type is empty", async () => {
  const response = await upload(PNG, "");
  expect(response.status).toBe(200);
  expect(mocks.uploadFile.mock.calls[0]?.[0].type).toBe("image/png");
});

function uploadNamed(bytes: Uint8Array<ArrayBuffer>, name: string, type = "") {
  const body = new FormData();
  body.set("file", new File([bytes], name, { type }));
  return POST(new Request("https://app.example/api/upload-attachment", { method: "POST", body }));
}

const text = (value: string) => new TextEncoder().encode(value);

test("accepts a JSON file and stores it as application/json", async () => {
  const response = await uploadNamed(text('{"a":1}'), "data.json", "application/json");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    url: "https://files.example/upload",
    mediaType: "application/json",
  });
  expect(mocks.uploadFile.mock.calls[0]?.[0].type).toBe("application/json");
});

test("stores HTML and source files as plain text so they never render", async () => {
  for (const name of ["page.html", "script.py", "notes.txt"]) {
    mocks.uploadFile.mockClear();
    const response = await uploadNamed(text("<b>hi</b>"), name, "text/html");
    expect(response.status).toBe(200);
    expect(mocks.uploadFile.mock.calls[0]?.[0].type).toBe("text/plain");
  }
});

test("converts Shift_JIS text to UTF-8 before storing it", async () => {
  // "日本語" in Shift_JIS.
  const sjis = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]);
  const response = await uploadNamed(sjis, "data.csv", "text/csv");
  expect(response.status).toBe(200);
  const stored = mocks.uploadFile.mock.calls[0]?.[0] as File;
  expect(stored.type).toBe("text/csv");
  expect(await stored.text()).toBe("日本語");
});

test("rejects binary data, unknown extensions and unsafe types", async () => {
  const binary = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
  expect((await uploadNamed(binary, "data.json")).status).toBe(415);
  expect((await uploadNamed(text("MZ"), "run.exe")).status).toBe(415);
  expect((await uploadNamed(text("<svg/>"), "image.svg", "image/svg+xml")).status).toBe(415);
  expect(mocks.uploadFile).not.toHaveBeenCalled();
});

test("limits text files to 2 MB", async () => {
  const large = new Uint8Array(2 * 1024 * 1024 + 1).fill(0x61);
  expect((await uploadNamed(large, "big.txt")).status).toBe(413);
});

test("rate-limits uploads per account", async () => {
  mocks.allowed = false;
  const response = await upload(PNG, "image/png");
  expect(response.status).toBe(429);
  expect(mocks.uploadFile).not.toHaveBeenCalled();
});

test("cross-site upload forms cannot store files using a victim's session", async () => {
  const body = new FormData();
  body.set("file", new File([PNG], "image.png", { type: "image/png" }));
  const response = await POST(
    new Request("https://app.example/api/upload-attachment", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
      body,
    }),
  );
  expect(response.status).toBe(403);
  expect(mocks.uploadFile).not.toHaveBeenCalled();
});

test("rejects an oversized body that arrives without a Content-Length", async () => {
  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      sent += 1;
      controller.enqueue(chunk);
      if (sent >= 40) controller.close();
    },
  });
  const response = await POST(
    new Request("https://app.example/api/upload-attachment", {
      method: "POST",
      body,
      headers: { "content-type": "multipart/form-data; boundary=x" },
      // @ts-expect-error Node's fetch requires `duplex` for streaming bodies.
      duplex: "half",
    }),
  );
  expect(response.status).toBe(413);
  expect(sent).toBeLessThan(20);
  expect(mocks.uploadFile).not.toHaveBeenCalled();
});
