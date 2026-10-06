import { afterEach, expect, test, vi } from "vitest";
import { fetchSafePublicHttpUrl, assertSafePublicHttpUrl } from "@/lib/network-security";
import {
  fetchPageMarkdown,
  fetchPageText,
  MAX_PAGE_RESPONSE_BYTES,
  readBoundedResponseText,
} from "./fetch-page";

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

test("fetchPageMarkdown reads page markdown through markdown.new", async () => {
  const fetch = vi.fn(
    async () => new Response(`# Title\n\n${"Readable body text. ".repeat(10)}`, { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  const page = await fetchPageMarkdown("https://probe.example/");
  expect(fetch).toHaveBeenCalledWith(
    "https://markdown.new/https://probe.example/",
    expect.anything(),
  );
  expect(page.content).toContain("Readable body text.");
});

test("fetchPageMarkdown rejects non-OK responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 500 })),
  );
  await expect(fetchPageMarkdown("https://probe.example/")).rejects.toThrow("500");
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

test("does not mistake a long article that mentions blocking for a block page", async () => {
  const article = `${"The forbidden city and the phrase access denied appear in this long article. ".repeat(40)}`;
  vi.mocked(fetchSafePublicHttpUrl).mockResolvedValue(
    new Response(
      `<html><head><title>History</title></head><body><article>${article}</article></body></html>`,
      {
        headers: { "content-type": "text/html" },
      },
    ),
  );
  const page = await fetchPageText("https://probe.example/", { allowReaderFallback: false });
  expect(page.content).toContain("forbidden city");
});

test("still rejects a short block page", async () => {
  vi.mocked(fetchSafePublicHttpUrl).mockResolvedValue(
    new Response(
      `<html><head><title>Just a moment...</title></head><body><main>${"Checking your browser before accessing the site. ".repeat(4)}</main></body></html>`,
      { headers: { "content-type": "text/html" } },
    ),
  );
  await expect(
    fetchPageText("https://probe.example/", { allowReaderFallback: false }),
  ).rejects.toThrow();
});
