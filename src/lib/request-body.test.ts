import { expect, test, vi } from "vitest";
import { readRequestBody, readRequestJson, RequestBodyTooLargeError } from "./request-body";

test("rejects oversized Content-Length without consuming its body", async () => {
  const request = new Request("https://app.example", {
    method: "POST",
    headers: { "content-length": "100" },
    body: "{}",
  });
  await expect(readRequestBody(request, 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  expect(request.bodyUsed).toBe(false);
});
test.each([undefined, "1"])("caps chunked bodies even with Content-Length %s", async (length) => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(8));
    },
    cancel,
  });
  const request = new Request("https://app.example", {
    method: "POST",
    body,
    headers: length ? { "content-length": length } : {},
    duplex: "half",
  } as RequestInit);
  await expect(readRequestBody(request, 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  expect(cancel).toHaveBeenCalledOnce();
});
test("parses a valid JSON request at the byte boundary", async () => {
  expect(
    await readRequestJson(
      new Request("https://app.example", { method: "POST", body: '{"a":1}' }),
      7,
    ),
  ).toEqual({ a: 1 });
});
