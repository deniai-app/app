import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter } from "@/server/api/root";
import { createContext } from "@/server/api/trpc";
import { guardMutationRequest } from "@/lib/mutation-request";
import { limitRequestBody, RequestBodyTooLargeError } from "@/lib/request-body";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET };

export async function POST(req: Request) {
  const rejected = guardMutationRequest(req, "application/json");
  if (rejected) return rejected;
  try {
    // Imports accept 25 MB of JSON; reserve space for the RPC envelope.
    const limited = limitRequestBody(req, 30 * 1024 * 1024);
    const response = await handler(limited.request);
    return limited.isTooLarge()
      ? Response.json({ error: "Request body is too large" }, { status: 413 })
      : response;
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof RequestBodyTooLargeError
            ? "Request body is too large"
            : "Invalid request body",
      },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }
}
