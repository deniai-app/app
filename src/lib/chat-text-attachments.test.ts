import type { UIMessage } from "ai";
import { afterEach, expect, test, vi } from "vitest";
import { inlineTextAttachments } from "./chat-text-attachments";

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
  const image = { type: "file", mediaType: "image/png", url: "https://x.ufs.sh/f/a" } as const;
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
    ]),
  ]);

  expect(fetchMock).not.toHaveBeenCalled();
  expect(textAt(message, 0)).toContain('"a.txt" could not be read');
  expect(textAt(message, 1)).toContain('"b.txt" could not be read');
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
