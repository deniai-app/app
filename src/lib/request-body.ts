export class RequestBodyTooLargeError extends Error {}

/** Keep RPC parsing lazy, so unauthenticated requests never require buffering a large body. */
export function limitRequestBody(request: Request, maxBytes: number) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new RequestBodyTooLargeError();
  let total = 0;
  let tooLarge = false;
  const body = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > maxBytes) {
          tooLarge = true;
          throw new RequestBodyTooLargeError();
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return {
    request: new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
      signal: request.signal,
      duplex: "half",
    } as RequestInit),
    isTooLarge: () => tooLarge,
  };
}

/** Cap the bytes read, including chunked bodies and a dishonest Content-Length. */
export async function readRequestBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new RequestBodyTooLargeError();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new RequestBodyTooLargeError();
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readRequestJson(request: Request, maxBytes: number): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await readRequestBody(request, maxBytes)));
}
