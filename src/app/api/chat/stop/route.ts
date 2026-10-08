import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getChatGenerationContextById, stopActiveChatGeneration } from "@/lib/chat";
import { stopChatGeneration } from "@/lib/chat-generation";
import { guardMutationRequest } from "@/lib/mutation-request";
import { readRequestJson, RequestBodyTooLargeError } from "@/lib/request-body";

export async function POST(req: Request) {
  const rejected = guardMutationRequest(req, "application/json");
  if (rejected) return rejected;
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  const userId = session?.session?.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await readRequestJson(req, 4096);
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }

  const parsedBody = z
    .object({
      id: z.string().min(1),
    })
    .safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const chat = await getChatGenerationContextById(parsedBody.data.id, userId);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // Clearing the active generation and its pending flag is one guarded write,
  // so a generation started meanwhile is neither stopped nor overwritten.
  const stoppedGenerationId = await stopActiveChatGeneration(chat.id, userId);
  if (stoppedGenerationId) stopChatGeneration(chat.id, stoppedGenerationId);

  return NextResponse.json({ ok: true });
}
