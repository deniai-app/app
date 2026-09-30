export function createAbortError() {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  return new Error("operation aborted");
}

export function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = (error as { name?: string }).name;
  const code = (error as { code?: unknown }).code;
  return (
    name === "AbortError" ||
    code === 20 ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}

/** Attach a no-op catch so Bun's extra abort rejection is not unhandled. */
export function fetchWithAbortHandling(input: string, init?: RequestInit) {
  const request = fetch(input, init);
  void request.catch((error) => {
    if (!isAbortError(error)) {
      return;
    }
  });
  return request;
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

/** Abort after `timeoutMs`, and cancel the timer so a finished run cannot reject later. */
export async function withDeadline<T>(
  timeoutMs: number,
  parent: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  parent?.addEventListener("abort", onAbort);

  try {
    throwIfAborted(parent);
    return await run(controller.signal);
  } finally {
    clearTimeout(timeoutId);
    parent?.removeEventListener("abort", onAbort);
  }
}
