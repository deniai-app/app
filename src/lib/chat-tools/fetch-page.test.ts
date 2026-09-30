import { afterEach, expect, test, vi } from "vitest";
import { fetchSafePublicHttpUrl, assertSafePublicHttpUrl } from "@/lib/network-security";
import { fetchPageText, MAX_PAGE_RESPONSE_BYTES, readBoundedResponseText } from "./fetch-page";

vi.mock("@/lib/network-security", () => ({
  assertSafePublicHttpUrl: vi.fn(async (url: string) => new URL(url)),
  fetchSafePublicHttpUrl: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
  vi.mocked(assertSafePublicHttpUrl).mockImplementation(async (url) => new URL(url));
  vi.unstubAllGlobals();
});

function streamed(chunks: Uint8Array[], headers?: HeadersInit) {
  const cancel = vi.fn();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
    cancel,
  });
  return { response: new Response(body, { headers }), cancel };
}

test("reads text within the limit and preserves UTF-8 across chunk boundaries", async () => {
  const bytes = new TextEncoder().encode("日本語");
  const { response } = streamed([bytes.slice(0, 2), bytes.slice(2, 5), bytes.slice(5)]);
  expect(await readBoundedResponseText(response)).toBe("日本語");
});

test("rejects an oversized Content-Length before reading and cancels the body", async () => {
  const { response, cancel } = streamed([new Uint8Array(1)], {
    "content-length": String(MAX_PAGE_RESPONSE_BYTES + 1),
  });
  await expect(readBoundedResponseText(response)).rejects.toThrow("too large");
  expect(cancel).toHaveBeenCalledOnce();
});

test.each([undefined, "1"])("bounds chunked bodies even with Content-Length %s", async (length) => {
  const { response, cancel } = streamed(
    [new Uint8Array(MAX_PAGE_RESPONSE_BYTES), new Uint8Array(1), new Uint8Array(1)],
    length ? { "content-length": length } : undefined,
  );
  await expect(readBoundedResponseText(response)).rejects.toThrow("too large");
  expect(cancel).toHaveBeenCalledOnce();
});

test("accepts exactly the byte limit", async () => {
  const { response } = streamed([new Uint8Array(MAX_PAGE_RESPONSE_BYTES)]);
  expect((await readBoundedResponseText(response)).length).toBe(MAX_PAGE_RESPONSE_BYTES);
});

test("direct page retrieval enforces the body limit", async () => {
  vi.mocked(fetchSafePublicHttpUrl).mockResolvedValue(
    streamed([new Uint8Array(MAX_PAGE_RESPONSE_BYTES + 1)], { "content-type": "text/plain" })
      .response,
  );
  await expect(
    fetchPageText("https://probe.example/", { allowReaderFallback: false }),
  ).rejects.toThrow("too large");
});

test("reader fallback enforces the same body limit", async () => {
  vi.mocked(fetchSafePublicHttpUrl).mockResolvedValue(new Response(null, { status: 403 }));
  const { response, cancel } = streamed([
    new Uint8Array(MAX_PAGE_RESPONSE_BYTES + 1),
    new Uint8Array(1),
  ]);
  const fetch = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetch);
  await expect(fetchPageText("https://probe.example/")).rejects.toThrow("too large");
  expect(fetch).toHaveBeenCalledWith("https://r.jina.ai/https://probe.example/", expect.anything());
  expect(cancel).toHaveBeenCalledOnce();
});
