import { suppressTracing } from "@sentry/nextjs";
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  readUIMessageStream,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type SystemModelMessage,
  type UIMessage,
} from "ai";
import { headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  clearChatGenerationState,
  generateTitle,
  getChatById,
  isChatGenerationActive,
  replaceLastChatMessage,
  updateChat,
} from "@/lib/chat";
import { mergeStoredAndClientMessages } from "@/lib/chat-messages";
import { inlineTextAttachments } from "@/lib/chat-text-attachments";
import {
  prepareBinaryAttachments,
  createChatAttachmentDownload,
} from "@/lib/chat-attachment-download";
import { isComparisonConversation } from "@/lib/comparison-conversation";
import {
  clearChatGeneration,
  isCurrentChatGeneration,
  startChatGeneration,
} from "@/lib/chat-generation";
import { createChatTools } from "@/lib/chat-tools";
import {
  getEffectiveTokenMultiplier,
  getModelContextWindow,
  getModelDefinition,
} from "@/lib/constants";
import { buildMemoryPrompt, getUserMemoryState, maybeAutoSaveMemories } from "@/lib/memory";
import { platformCapabilities } from "@/lib/platform-capabilities.server";
import { buildProjectPrompt } from "@/lib/project-context";
import {
  canCompareModels,
  consumeUsage,
  recordObservedUsage,
  settleUsage as settleUsageReservation,
  UsageLimitError,
} from "@/lib/usage";
import { calculateChatUsageAmount, resolveFinalChatUsageAmount } from "@/lib/chat-usage-amount";
import { checkRateLimit } from "@/lib/rate-limit";
import { guardMutationRequest } from "@/lib/mutation-request";
import { readRequestJson, RequestBodyTooLargeError } from "@/lib/request-body";
import {
  classifyUpstreamError,
  extractChatRequestErrorText,
  formatUpstreamErrorMessage,
  GENERIC_CHAT_REQUEST_ERROR,
  isContextOverflowMessage,
} from "@/lib/chat-request-error";
import { authorLabels } from "@/app/(home)/models/models-author-labels";
import { addOpenRouterCacheControl, ChatRouteError, resolveChatModelContext } from "./_lib/model";
import { buildChatSystemPrompt } from "./_lib/prompt";
import { ChatRequestSchema, setPendingState } from "./_lib/schema";

const tokenCountFormatter = new Intl.NumberFormat("en-US");

const MAX_STEPS = 50;
// Guests are billed per request, not per token, so bound the tool loop a single
// guest request can run.
const GUEST_MAX_STEPS = 8;

function formatChatStreamError(error: unknown, modelId: string): string {
  console.error("Chat request error", error);

  const upstreamKind = classifyUpstreamError(error);
  if (upstreamKind) {
    const author = getModelDefinition(modelId)?.author;
    const providerName = (author && authorLabels[author]) || author || "This provider's";
    return formatUpstreamErrorMessage(upstreamKind, providerName);
  }

  const rawMessage = extractChatRequestErrorText(error);
  if (!rawMessage || !isContextOverflowMessage(rawMessage)) {
    return GENERIC_CHAT_REQUEST_ERROR;
  }

  const modelName = getModelDefinition(modelId)?.name ?? modelId;
  const contextWindow = getModelContextWindow(modelId);

  if (contextWindow) {
    return `${modelName} exceeded its context window (${tokenCountFormatter.format(contextWindow)} tokens). Start a new chat or trim earlier messages/files.`;
  }

  return `${modelName} exceeded its context window. Start a new chat or trim earlier messages/files.`;
}

/** Uncapped prompt-size estimate (chars/4). Used for long-context preflight. */
function estimatePromptInputTokens({
  modelMessages,
  systemPrompt,
}: {
  modelMessages: unknown;
  systemPrompt: string;
}): number {
  const serializedMessages = JSON.stringify(modelMessages);
  return Math.ceil((serializedMessages.length + systemPrompt.length) / 4);
}

/**
 * Reserve at least the estimated prompt before streaming starts, so a request
 * whose input alone exceeds the remaining quota is rejected up front. Long-context
 * sessions (>200K estimated input on OpenAI 1M models) also hold the 2× premium.
 * Settlement reconciles to the provider-reported usage afterwards.
 */
function estimateTokenReservation({
  modelMessages,
  systemPrompt,
  modelId,
  proMode = false,
  fastMode = false,
}: {
  modelMessages: unknown;
  systemPrompt: string;
  modelId: string;
  proMode?: boolean;
  fastMode?: boolean;
}) {
  const estimatedPromptTokens = estimatePromptInputTokens({ modelMessages, systemPrompt });
  const effectiveMultiplier = getEffectiveTokenMultiplier(modelId, estimatedPromptTokens, {
    proMode,
    fastMode,
  });
  const baseUnits = Math.max(512, estimatedPromptTokens + 1_024);

  return Math.ceil(baseUnits * effectiveMultiplier);
}

export async function POST(req: Request) {
  const rejected = guardMutationRequest(req, "application/json");
  if (rejected) return rejected;
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  const userId = session?.session?.userId;
  const isAnonymous = Boolean(session?.user?.isAnonymous);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await readRequestJson(req, 16 * 1024 * 1024);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof RequestBodyTooLargeError
            ? "Request body is too large"
            : "Invalid request body",
      },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }

  const rateCheck = await checkRateLimit({
    key: `chat:${userId}`,
    windowMs: 60_000,
    maxRequests: 30,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } },
    );
  }

  const parsedBody = ChatRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (parsedBody.data.comparison && !(await canCompareModels(userId))) {
    return NextResponse.json({ error: "Model comparison requires Pro or Max." }, { status: 403 });
  }

  const {
    id: requestId,
    messages: rawMessages = [],
    model: baseModel,
    webSearch = false,
    reasoningEffort = "high",
    proMode: requestedProMode = false,
    fastMode: requestedFastMode = false,
    deepResearch = false,
    responseStyle,
    forceWebSearch = false,
    additionalInstruction,
  } = parsedBody.data;

  if (isAnonymous && (requestedProMode || requestedFastMode || deepResearch)) {
    return NextResponse.json(
      { error: "Fast, Pro, and Deep Research are not available for guest sessions." },
      { status: 403 },
    );
  }

  const isComparison = parsedBody.data.comparison === true;
  // Ephemeral generation keys are scoped to the authenticated account and never
  // overlap persisted chat IDs or another user's in-process generation lock.
  const id = isComparison ? `comparison:${userId}:${requestId}` : requestId;

  const validatedMessagesPromise = safeValidateUIMessages<UIMessage>({
    messages: rawMessages,
  });

  const [chat, validatedMessages] = await Promise.all([
    isComparison
      ? Promise.resolve({ title: null, projectId: null, messages: [] as UIMessage[] })
      : getChatById(id, userId),
    validatedMessagesPromise,
  ]);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (!validatedMessages.success) {
    return NextResponse.json({ error: "Invalid messages payload" }, { status: 400 });
  }

  if (isComparison && !isComparisonConversation(validatedMessages.data)) {
    return NextResponse.json({ error: "Invalid comparison conversation." }, { status: 400 });
  }

  const storedMessages = Array.isArray(chat.messages) ? (chat.messages as UIMessage[]) : [];
  const messages = mergeStoredAndClientMessages(storedMessages, validatedMessages.data);

  let memoryState: Awaited<ReturnType<typeof getUserMemoryState>>;
  let modelContext: Awaited<ReturnType<typeof resolveChatModelContext>>;

  try {
    [memoryState, modelContext] = await Promise.all([
      getUserMemoryState(userId),
      resolveChatModelContext({
        userId,
        isAnonymous,
        baseModel,
        reasoningEffort,
        proMode: requestedProMode,
        fastMode: requestedFastMode,
      }),
    ]);
  } catch (error) {
    if (error instanceof ChatRouteError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    console.error("Chat request error", error);
    return NextResponse.json({ error: GENERIC_CHAT_REQUEST_ERROR }, { status: 500 });
  }

  const { model, providerOptions, usageCategory, usageUnit, usesOpenRouter } = modelContext;

  // Pro / Fast are available for OpenAI models routed through OpenRouter.
  const modelDef = getModelDefinition(baseModel);
  const proMode = Boolean(
    requestedProMode && modelDef?.supportsProMode && modelDef.author === "openai" && usesOpenRouter,
  );
  const fastMode = Boolean(
    requestedFastMode &&
    modelDef?.supportsFastMode &&
    modelDef.author === "openai" &&
    usesOpenRouter,
  );

  const enabledTools = parsedBody.data.enabledTools ?? ["search", "browse"];
  const searchToolEnabled =
    platformCapabilities.features.webSearch && enabledTools.includes("search");
  const browseToolEnabled =
    platformCapabilities.features.webSearch && enabledTools.includes("browse");
  const webSearchEnabled = searchToolEnabled || browseToolEnabled;
  const deepResearchEnabled = searchToolEnabled && deepResearch;
  // Explicit Search (or a retry that requests search) still forces at least one lookup.
  const forceWebSearchEnabled = searchToolEnabled && (forceWebSearch || webSearch);
  const tools = createChatTools({
    // Comparison panes have no interactive questionnaire UI.
    interactive: !parsedBody.data.comparison,
    webSearch: webSearchEnabled,
    enabledTools,
    usage: {
      userId,
      isAnonymous,
    },
  });

  // Models accept images and PDFs as files, not text files, so inline those.
  let modelMessages: ModelMessage[];
  try {
    modelMessages = await convertToModelMessages(
      prepareBinaryAttachments(await inlineTextAttachments(messages)),
    );
  } catch {
    return NextResponse.json({ error: "Invalid or oversized attachment" }, { status: 400 });
  }
  const currentDate = new Date().toISOString().split("T")[0];
  const persistentMemory = platformCapabilities.features.memory
    ? buildMemoryPrompt(memoryState)
    : null;

  const responseMessageId = generateId();
  const generationId = generateId();
  const shouldGenerateTitle = chat.title === "New Chat";
  const pendingAssistantMessage = setPendingState(
    {
      id: responseMessageId,
      role: "assistant",
      parts: [],
    } as UIMessage,
    true,
  );

  let generationAbortController: AbortController | undefined;
  let pendingStateRolledBack = false;
  let usageConsumed = false;
  let usageRefunded = false;
  let generationWatch: ReturnType<typeof setInterval> | undefined;
  let usageWatch: ReturnType<typeof setInterval> | undefined;
  let trailingPersistTimer: ReturnType<typeof setTimeout> | undefined;
  let hasAssistantOutput = false;
  let consumedUsageAmount = 0;
  const modelReservationId = `${generationId}:model`;
  const persistObservedUsage = async () => {
    if (!usageConsumed) return;
    const amount =
      usageUnit === "tokens"
        ? Math.max(finalUsageAmount, hasAssistantOutput ? 1 : 0)
        : hasAssistantOutput
          ? 1
          : 0;
    try {
      await recordObservedUsage({ userId, reservationId: modelReservationId, amount });
    } catch (error) {
      console.error("Failed to persist observed chat usage", error);
    }
  };
  const watchUsage = () => {
    usageWatch = setInterval(() => {
      void persistObservedUsage();
    }, 30_000);
  };
  let finalUsageAmount = 0;

  const ownsCurrentGeneration = async () => {
    return (
      isCurrentChatGeneration(id, generationId) &&
      (isComparison || (await isChatGenerationActive(id, userId, generationId)))
    );
  };

  const refundConsumedUsage = async () => {
    if (
      !usageConsumed ||
      usageRefunded ||
      hasAssistantOutput ||
      (usageUnit === "tokens" && finalUsageAmount > 0)
    )
      return;
    try {
      await settleUsageReservation({ userId, reservationId: modelReservationId, amount: 0 });
      usageRefunded = true;
      usageConsumed = false;
    } catch (error) {
      console.error("Failed to refund chat usage", error);
    }
  };

  let usageSettlement: Promise<void> | undefined;
  const settleUsage = () => {
    usageSettlement ??= (async () => {
      if (!usageConsumed) return;
      const amount =
        usageUnit === "tokens"
          ? Math.max(finalUsageAmount, hasAssistantOutput ? 1 : 0)
          : hasAssistantOutput
            ? 1
            : 0;
      await settleUsageReservation({ userId, reservationId: modelReservationId, amount });
    })();
    return usageSettlement;
  };

  const rollbackPendingAssistantState = async () => {
    if (isComparison || pendingStateRolledBack) {
      return;
    }

    pendingStateRolledBack = true;

    try {
      if (!(await ownsCurrentGeneration())) {
        return;
      }
      await updateChat(id, userId, messages, undefined, {
        expectedGenerationId: generationId,
      });
    } catch (error) {
      console.error("Failed to rollback pending chat response", error);
    }
  };

  const abortComparison = () => generationAbortController?.abort("stopped");

  const clearGenerationLock = () => {
    if (usageWatch) {
      clearInterval(usageWatch);
      usageWatch = undefined;
    }
    if (isComparison) req.signal.removeEventListener("abort", abortComparison);
    if (generationWatch) {
      clearInterval(generationWatch);
      generationWatch = undefined;
    }

    if (trailingPersistTimer) {
      clearTimeout(trailingPersistTimer);
      trailingPersistTimer = undefined;
    }

    if (!generationAbortController) {
      return;
    }

    clearChatGeneration(id, generationId);
    generationAbortController = undefined;
  };

  let projectPrompt: string | null;

  try {
    ({ abortController: generationAbortController } = startChatGeneration(id, generationId));
    if (isComparison) {
      req.signal.addEventListener("abort", abortComparison, { once: true });
      if (req.signal.aborted) abortComparison();
    } else {
      await updateChat(id, userId, [...messages, pendingAssistantMessage], undefined, {
        nextGenerationId: generationId,
      });
    }
    projectPrompt = isComparison ? null : await buildProjectPrompt(chat.projectId, userId);
    if (usageUnit === "requests") {
      consumedUsageAmount = 1;
      await consumeUsage({
        userId,
        category: usageCategory,
        reservationId: modelReservationId,
        isAnonymous,
        amount: consumedUsageAmount,
      });
      usageConsumed = true;
      watchUsage();
    }
  } catch (error) {
    await rollbackPendingAssistantState();
    await refundConsumedUsage();
    clearGenerationLock();
    if (error instanceof UsageLimitError) {
      return NextResponse.json({ error: error.message, reason: "usage_limit" }, { status: 402 });
    }
    throw error;
  }

  const systemPrompt = buildChatSystemPrompt({
    currentDate,
    persistentMemory,
    projectPrompt,
    additionalInstruction,
    responseStyle,
    webSearchEnabled,
    searchToolEnabled,
    browseToolEnabled,
    interactive: !isComparison,
    deepResearch: deepResearchEnabled,
    forceWebSearch: forceWebSearchEnabled,
  });

  let requestMessages: ModelMessage[] = modelMessages;
  let requestSystem: string | SystemModelMessage = systemPrompt;

  if (usesOpenRouter) {
    const cachedPrompt = addOpenRouterCacheControl(modelMessages, systemPrompt);
    requestMessages = cachedPrompt.messages;
    requestSystem = cachedPrompt.system;
  }

  if (!isComparison) {
    // Cross-instance stop check. Untraced: a 1s poll would otherwise add one
    // identical DB span per second and trip Sentry's N+1 query detector.
    generationWatch = setInterval(() => {
      void suppressTracing(() => isChatGenerationActive(id, userId, generationId))
        .then((isActive) => {
          if (!isActive) {
            generationAbortController?.abort("stopped");
          }
        })
        // A failed poll must not stop the generation; the next tick checks again.
        .catch((error) => {
          console.warn("[chat] generation ownership poll failed", error);
        });
    }, 1000);
  }

  let result: ReturnType<typeof streamText<typeof tools>>;

  try {
    if (usageUnit === "tokens") {
      consumedUsageAmount = estimateTokenReservation({
        modelMessages,
        systemPrompt,
        modelId: baseModel,
        proMode,
        fastMode,
      });
      await consumeUsage({
        userId,
        category: usageCategory,
        reservationId: modelReservationId,
        isAnonymous,
        amount: consumedUsageAmount,
      });
      usageConsumed = true;
      watchUsage();
      usageRefunded = false;
    }

    result = streamText({
      model: model,
      experimental_download: createChatAttachmentDownload(generationAbortController.signal),
      messages: requestMessages,
      abortSignal: generationAbortController.signal,
      stopWhen: stepCountIs(isAnonymous ? GUEST_MAX_STEPS : MAX_STEPS),
      tools,
      // onFinish is not called by the SDK after an abort. Keep the usage of
      // completed steps so stopped/replaced generations still get reconciled.
      onStepFinish: async ({ usage }) => {
        finalUsageAmount += calculateChatUsageAmount(baseModel, usage, { proMode, fastMode });
        await persistObservedUsage();
      },
      onFinish: async ({ totalUsage }) => {
        finalUsageAmount = resolveFinalChatUsageAmount(finalUsageAmount, baseModel, totalUsage, {
          proMode,
          fastMode,
        });
        await persistObservedUsage();
      },
      providerOptions,
      system: requestSystem,
    });
  } catch (error) {
    await rollbackPendingAssistantState();
    await refundConsumedUsage();
    // Nothing streamed, so there is no reconciliation left to wait for.
    clearGenerationLock();
    // The token reservation can exceed what is left even when the pre-check passed.
    if (error instanceof UsageLimitError) {
      return NextResponse.json({ error: error.message, reason: "usage_limit" }, { status: 402 });
    }
    return NextResponse.json({ error: formatChatStreamError(error, baseModel) }, { status: 500 });
  }

  // Throttle JSONB writes during streaming. Only the last assistant message is
  // rewritten (jsonb_set on the final array index). We persist at most every
  // PERSIST_INTERVAL_MS, and a trailing-edge timer ensures the most recent
  // chunk eventually lands even if nothing new arrives.
  const PERSIST_INTERVAL_MS = 1500;
  let lastPersistedSignature = "";
  let latestPersistedMessage: UIMessage = pendingAssistantMessage;
  let partialPersistPromise: Promise<void> = Promise.resolve();
  let lastPersistAt = 0;
  let pendingDirty = false;

  const runPersist = () => {
    pendingDirty = false;
    lastPersistAt = Date.now();
    if (trailingPersistTimer) {
      clearTimeout(trailingPersistTimer);
      trailingPersistTimer = undefined;
    }
    partialPersistPromise = partialPersistPromise
      .catch(() => undefined)
      .then(async () => {
        try {
          if (!(await ownsCurrentGeneration())) {
            return;
          }
          await replaceLastChatMessage(id, userId, latestPersistedMessage, {
            expectedGenerationId: generationId,
          });
        } catch (error) {
          console.error("Failed to persist partial chat response", error);
        }
      });
  };

  const queuePartialPersist = (message: UIMessage, force: boolean = false) => {
    const pendingMessage = setPendingState(message, true);
    if (pendingMessage.parts.length > 0) {
      if (!hasAssistantOutput) {
        hasAssistantOutput = true;
        void persistObservedUsage();
      }
    }
    if (isComparison) {
      latestPersistedMessage = pendingMessage;
      return;
    }
    const signature = JSON.stringify(pendingMessage.parts);

    if (!force && signature === lastPersistedSignature) {
      return;
    }

    latestPersistedMessage = pendingMessage;
    lastPersistedSignature = signature;
    pendingDirty = true;

    const elapsed = Date.now() - lastPersistAt;
    if (force || elapsed >= PERSIST_INTERVAL_MS) {
      runPersist();
      return;
    }

    if (!trailingPersistTimer) {
      trailingPersistTimer = setTimeout(() => {
        trailingPersistTimer = undefined;
        if (pendingDirty) runPersist();
      }, PERSIST_INTERVAL_MS - elapsed);
    }
  };

  const stream = createUIMessageStream<UIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      try {
        writer.write({
          type: "start",
          messageId: responseMessageId,
        });

        const uiStream = result.toUIMessageStream<UIMessage>({
          sendReasoning: true,
          sendSources: true,
          sendStart: false,
          onError: (error) => formatChatStreamError(error, baseModel),
        });
        const [clientStream, persistenceStream] = uiStream.tee();

        writer.merge(clientStream);

        for await (const message of readUIMessageStream<UIMessage>({
          stream: persistenceStream,
        })) {
          // In-memory only: this runs for every chunk. The database ownership check
          // happens in the 1s poll above and again before each persisted write.
          if (!isCurrentChatGeneration(id, generationId)) {
            break;
          }
          queuePartialPersist(message);
        }

        if (trailingPersistTimer) {
          clearTimeout(trailingPersistTimer);
          trailingPersistTimer = undefined;
        }
        queuePartialPersist(latestPersistedMessage, true);

        await partialPersistPromise;
      } catch (error) {
        await rollbackPendingAssistantState();
        await refundConsumedUsage();
        clearGenerationLock();
        throw new Error(formatChatStreamError(error, baseModel));
      }
    },
    onFinish: async ({ messages: updatedMessages, isAborted }) => {
      try {
        await partialPersistPromise;
        hasAssistantOutput ||= updatedMessages.some(
          (message) => message.id === responseMessageId && message.parts.length > 0,
        );
        // Accounting belongs to this request, not to the current chat-row owner.
        // Stopping/replacing the generation must only suppress transcript writes.
        try {
          await settleUsage();
        } catch (error) {
          // The answer was already streamed; a billing failure must not drop it
          // from the saved transcript.
          console.error("Failed to settle chat usage", error);
        }

        // Comparisons consume normal usage but never write chats or auto-memory.
        // The chosen transcript is saved explicitly by saveComparison later.
        if (isComparison) return;

        if (!(await ownsCurrentGeneration())) {
          pendingStateRolledBack = true;
          return;
        }

        let newTitle: string | undefined;

        try {
          if (shouldGenerateTitle) {
            newTitle = await generateTitle(updatedMessages);
          }
        } catch (error) {
          console.error("Failed to generate title", error);
        }

        const finalizedMessages = updatedMessages.map((message) =>
          message.id === responseMessageId ? setPendingState(message, false) : message,
        );
        const cleared = await clearChatGenerationState(
          id,
          userId,
          generationId,
          finalizedMessages.at(-1),
          newTitle,
        );

        if (!cleared) {
          pendingStateRolledBack = true;
          return;
        }

        pendingStateRolledBack = true;

        if (isAborted || generationAbortController?.signal.aborted) {
          return;
        }

        // Memory extraction can take seconds and must not keep the chat SSE
        // open. Schedule it after the response finishes so the client can end
        // the request immediately while work continues on the backend.
        if (platformCapabilities.features.memory && memoryState.profile.autoMemory) {
          after(() =>
            maybeAutoSaveMemories({
              userId,
              messages: updatedMessages,
              enabled: true,
            }).catch((error) => {
              console.error("Failed to auto-save memories", error);
            }),
          );
        }
      } catch (error) {
        await rollbackPendingAssistantState();
        await refundConsumedUsage();
        throw error;
      } finally {
        clearGenerationLock();
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: consumeStream,
  });
}
