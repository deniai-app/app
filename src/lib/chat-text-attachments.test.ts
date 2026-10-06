import type { UIMessage } from "ai";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { UPLOADTHING_TOKEN: Buffer.from(JSON.stringify({ appId: "app" })).toString("base64") },
}));

const { inlineTextAttachments } = await import("./chat-text-attachments");

afterEach(() => {
  vi.unstubAllGlobals();
});

function dataUrl(text: string, type = "application/json") {
  return `data:${type};base64,${Buffer.from(text).toString("base64")}`;
}

function textAt(message: UIMessage | undefined, index: number) {
  return (message?.parts[index] as { text: string } | undefined)?.text ?? "";
}

function userMessage(parts: UIMessage["parts"]): UIMessage {
  return { id: "m1", role: "user", parts };
}

test("replaces text attachments with their contents and keeps other parts", async () => {
  const image = { type: "file", mediaType: "image/png", url: "https://app.ufs.sh/f/a" } as const;
  const [message] = await inlineTextAttachments([
    userMessage([
      { type: "text", text: "Summarize" },
      {
        type: "file",
        mediaType: "application/json",
        filename: "data.json",
        url: dataUrl('{"a":1}'),
      },
      image,
    ]),
  ]);

  expect(message?.parts[0]).toEqual({ type: "text", text: "Summarize" });
  expect(message?.parts[1]).toEqual({
    type: "text",
    text: '<attached_file name="data.json">\n{"a":1}\n</attached_file>',
  });
  expect(message?.parts[2]).toBe(image);
});

test("recognizes a text file by name when the stored media type is empty", async () => {
  const [message] = await inlineTextAttachments([
    userMessage([
      { type: "file", mediaType: "", filename: "notes.py", url: dataUrl("print(1)", "") },
    ]),
  ]);
  expect(message?.parts[0]).toMatchObject({ type: "text" });
  expect(textAt(message, 0)).toContain("print(1)");
});

test("never fetches URLs outside the attachment store", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const [message] = await inlineTextAttachments([
    userMessage([
      { type: "file", mediaType: "text/plain", filename: "a.txt", url: "http://169.254.169.254/x" },
      {
        type: "file",
        mediaType: "text/plain",
        filename: "b.txt",
        url: "https://evil.example/ufs.sh",
      },
      {
        type: "file",
        mediaType: "text/plain",
        filename: "c.txt",
        url: "https://other-tenant.ufs.sh/f/key",
      },
    ]),
  ]);

  expect(fetchMock).not.toHaveBeenCalled();
  expect(textAt(message, 0)).toContain('"a.txt" could not be read');
  expect(textAt(message, 1)).toContain('"b.txt" could not be read');
  expect(textAt(message, 2)).toContain('"c.txt" could not be read');
});

test("stops reading a stored file that streams past the size cap", async () => {
  const chunk = new Uint8Array(1024 * 1024).fill(97);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      sent += 1;
      controller.enqueue(chunk);
      if (sent >= 100) controller.close();
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body)),
  );

  const [message] = await inlineTextAttachments([
    userMessage([
      {
        type: "file",
        mediaType: "text/plain",
        filename: "big.txt",
        url: "https://app.ufs.sh/f/big",
      },
    ]),
  ]);

  expect(textAt(message, 0)).toContain('"big.txt" could not be read');
  expect(sent).toBeLessThan(10);
});

test("keeps the newest attachments when the total is too long", async () => {
  const half = "a".repeat(300_000);
  const [older, newer] = await inlineTextAttachments([
    userMessage([
      {
        type: "file",
        mediaType: "text/plain",
        filename: "old.txt",
        url: dataUrl(half, "text/plain"),
      },
    ]),
    userMessage([
      {
        type: "file",
        mediaType: "text/plain",
        filename: "new.txt",
        url: dataUrl(half, "text/plain"),
      },
    ]),
  ]);

  expect(textAt(newer, 0)).not.toContain("Truncated");
  expect(textAt(older, 0)).toContain("[Truncated: only the first 100,000");
});

test("fetches stored attachments without following redirects", async () => {
  const fetchMock = vi.fn(async () => new Response("hello"));
  vi.stubGlobal("fetch", fetchMock);

  const [message] = await inlineTextAttachments([
    userMessage([
      { type: "file", mediaType: "text/plain", filename: "a.txt", url: "https://app.ufs.sh/f/key" },
    ]),
  ]);

  expect(fetchMock).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({ redirect: "error" }),
  );
  expect(textAt(message, 0)).toContain("hello");
});

test("truncates very long files with a notice and leaves assistant messages alone", async () => {
  const long = "a".repeat(400_050);
  const assistant: UIMessage = {
    id: "m2",
    role: "assistant",
    parts: [{ type: "file", mediaType: "text/plain", url: dataUrl("x", "text/plain") }],
  };
  const [message, untouched] = await inlineTextAttachments([
    userMessage([
      {
        type: "file",
        mediaType: "text/plain",
        filename: "long.txt",
        url: dataUrl(long, "text/plain"),
      },
    ]),
    assistant,
  ]);

  expect(textAt(message, 0)).toContain("[Truncated: only the first 400,000");
  expect(untouched).toBe(assistant);
});
