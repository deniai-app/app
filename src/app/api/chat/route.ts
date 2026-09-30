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
  OPENAI_LONG_CONTEXT_INPUT_THRESHOLD,
  supportsOpenAILongContextPricing,
} from "@/lib/constants";
import { buildMemoryPrompt, getUserMemoryState, maybeAutoSaveMemories } from "@/lib/memory";
import { platformCapabilities } from "@/lib/platform-capabilities.server";
import { buildProjectPrompt } from "@/lib/project-context";
import { reportMaxModeUsageToStripe } from "@/lib/max-mode";
import { consumeUsage, refundUsage, UsageLimitError } from "@/lib/usage";
import {
  computeWeightedUsageFromLanguageModelUsage,
  type TokenUsageBreakdown,
} from "@/lib/token-weighting";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  extractChatRequestErrorText,
  GENERIC_CHAT_REQUEST_ERROR,
  isContextOverflowMessage,
} from "@/lib/chat-request-error";
import { addOpenRouterCacheControl, ChatRouteError, resolveChatModelContext } from "./_lib/model";
import { buildChatSystemPrompt } from "./_lib/prompt";
import { ChatRequestSchema, setPendingState } from "./_lib/schema";

const tokenCountFormatter = new Intl.NumberFormat("en-US");

function formatChatStreamError(error: unknown, modelId: string): string {
  console.error("Chat request error", error);

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
 * Reserve a bounded token budget for short chats. Long-context sessions
 * (>200K estimated input on OpenAI 1M models) reserve using the uncapped
 * estimate so the 2× premium is held before streaming starts.
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
  const isLongContext =
    supportsOpenAILongContextPricing(modelId) &&
    estimatedPromptTokens > OPENAI_LONG_CONTEXT_INPUT_THRESHOLD;

  const baseUnits = isLongContext
    ? Math.max(512, estimatedPromptTokens + 1_024)
    : Math.max(512, Math.min(8_192, estimatedPromptTokens + 1_024));

  return Math.ceil(baseUnits * effectiveMultiplier);
}

function getUsageInputTokens(
  usage: {
    inputTokens?: number | null;
  },
  breakdown: TokenUsageBreakdown | null,
): number {
  if (breakdown) {
    return breakdown.input + breakdown.cacheRead + breakdown.cacheWrite;
  }
  return typeof usage.inputTokens === "number" && Number.isFinite(usage.inputTokens)
    ? Math.max(0, usage.inputTokens)
    : 0;
}

const TOKEN_RECONCILE_OVERFLOW_BUFFER = 256;

export async function POST(req: Request) {
  const headersList = await headers();
  const sessionPromise = auth.api.getSession({ headers: headersList });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // The auth lookup started in parallel with body parsing. Attach a handler
    // before returning so a rejected lookup cannot become an unhandled promise.
    void sessionPromise.catch(() => undefined);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const session = await sessionPromise;
  const userId = session?.session?.userId;
  const isAnonymous = Boolean(session?.user?.isAnonymous);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const {
    id,
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

  const validatedMessagesPromise = safeValidateUIMessages<UIMessage>({
    messages: rawMessages,
  });

  const [chat, validatedMessages] = await Promise.all([
    getChatById(id, userId),
    validatedMessagesPromise,
  ]);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (!validatedMessages.success) {
    return NextResponse.json({ error: "Invalid messages payload" }, { status: 400 });
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

  const webSearchEnabled = platformCapabilities.features.webSearch;
  const deepResearchEnabled = webSearchEnabled && deepResearch;
  // Explicit Search (or a retry that requests search) still forces at least one lookup.
  const forceWebSearchEnabled = webSearchEnabled && (forceWebSearch || webSearch);
  // Net Max Mode overage for this request, including search-tool charges.
  // Reported to Stripe once after reconciliation; meter events cannot be reduced.
  let pendingMaxModeAmount = 0;
  const tools = createChatTools({
    webSearch: webSearchEnabled,
    usage: {
      userId,
      isAnonymous,
      onCharged: ({ maxModeAmount }) => {
        pendingMaxModeAmount += maxModeAmount;
      },
      onRefunded: ({ maxModeRefunded }) => {
        pendingMaxModeAmount = Math.max(0, pendingMaxModeAmount - maxModeRefunded);
      },
    },
  });

  const modelMessages = await convertToModelMessages(messages);
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
  let trailingPersistTimer: ReturnType<typeof setTimeout> | undefined;
  let hasAssistantOutput = false;
  let consumedUsageAmount = 0;
  let finalUsageAmount = 0;

  const ownsCurrentGeneration = async () => {
    return (
      isCurrentChatGeneration(id, generationId) &&
      (await isChatGenerationActive(id, userId, generationId))
    );
  };

  const refundConsumedUsage = async () => {
    if (!usageConsumed || usageRefunded || hasAssistantOutput) {
      return;
    }

    usageRefunded = true;

    try {
      const refunded = await refundUsage({
        userId,
        category: usageCategory,
        amount: consumedUsageAmount,
        isAnonymous,
      });
      usageConsumed = false;
      consumedUsageAmount = 0;
      pendingMaxModeAmount = Math.max(pendingMaxModeAmount - refunded.maxModeRefunded, 0);
    } catch (error) {
      console.error("Failed to refund chat usage", error);
    }
  };

  const reconcileConsumedUsage = async (targetAmount: number) => {
    if (usageUnit !== "tokens") {
      return;
    }

    const normalizedTargetAmount = Math.max(targetAmount, hasAssistantOutput ? 1 : 0);
    if (normalizedTargetAmount === consumedUsageAmount) {
      return;
    }

    if (!usageConsumed) {
      if (normalizedTargetAmount <= 0) {
        return;
      }

      const consumed = await consumeUsage({
        userId,
        category: usageCategory,
        isAnonymous,
        amount: normalizedTargetAmount,
        allowLimitOverflow: normalizedTargetAmount <= TOKEN_RECONCILE_OVERFLOW_BUFFER,
      });
      pendingMaxModeAmount += consumed.maxModeAmount;
      consumedUsageAmount = normalizedTargetAmount;
      usageConsumed = true;
      usageRefunded = false;
      return;
    }

    const delta = normalizedTargetAmount - consumedUsageAmount;
    if (delta > 0) {
      const consumed = await consumeUsage({
        userId,
        category: usageCategory,
        isAnonymous,
        amount: delta,
        allowLimitOverflow: delta <= TOKEN_RECONCILE_OVERFLOW_BUFFER,
      });
      pendingMaxModeAmount += consumed.maxModeAmount;
    } else if (delta < 0) {
      const refunded = await refundUsage({
        userId,
        category: usageCategory,
        amount: Math.abs(delta),
        isAnonymous,
      });
      pendingMaxModeAmount = Math.max(pendingMaxModeAmount - refunded.maxModeRefunded, 0);
    }

    consumedUsageAmount = normalizedTargetAmount;
    usageConsumed = normalizedTargetAmount > 0;
    usageRefunded = normalizedTargetAmount === 0;
  };

  let usageSettlement: Promise<void> | undefined;
  const settleUsage = () => {
    usageSettlement ??=
      usageUnit === "tokens"
        ? reconcileConsumedUsage(finalUsageAmount)
        : !hasAssistantOutput
          ? refundConsumedUsage()
          : Promise.resolve();
    return usageSettlement;
  };

  /**
   * Sends the reconciled Max Mode overage to Stripe. Runs exactly once at the end
   * of the request: meter events are append-only, so reporting the up-front
   * estimate and reconciling down afterwards would leave the customer overbilled.
   */
  let maxModeReported = false;
  const flushMaxModeUsage = async () => {
    if (maxModeReported) {
      return;
    }
    maxModeReported = true;

    if (pendingMaxModeAmount <= 0) {
      return;
    }

    try {
      await reportMaxModeUsageToStripe(userId, usageCategory, pendingMaxModeAmount);
    } catch (error) {
      console.error("Failed to report Max Mode usage", error);
    }
  };

  const rollbackPendingAssistantState = async () => {
    if (pendingStateRolledBack) {
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

  const clearGenerationLock = () => {
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
    await updateChat(id, userId, [...messages, pendingAssistantMessage], undefined, {
      nextGenerationId: generationId,
    });
    projectPrompt = await buildProjectPrompt(chat.projectId, userId);
    if (usageUnit === "requests") {
      consumedUsageAmount = 1;
      const consumed = await consumeUsage({
        userId,
        category: usageCategory,
        isAnonymous,
        amount: consumedUsageAmount,
      });
      pendingMaxModeAmount += consumed.maxModeAmount;
      usageConsumed = true;
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

  generationWatch = setInterval(() => {
    void isChatGenerationActive(id, userId, generationId).then((isActive) => {
      if (!isActive) {
        generationAbortController?.abort("stopped");
      }
    });
  }, 1000);

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
      const consumed = await consumeUsage({
        userId,
        category: usageCategory,
        isAnonymous,
        amount: consumedUsageAmount,
      });
      pendingMaxModeAmount += consumed.maxModeAmount;
      usageConsumed = true;
      usageRefunded = false;
    }

    result = streamText({
      model: model,
      messages: requestMessages,
      abortSignal: generationAbortController.signal,
      stopWhen: stepCountIs(50),
      tools,
      // onFinish is not called by the SDK after an abort. Keep the usage of
      // completed steps so stopped/replaced generations still get reconciled.
      onStepFinish: ({ usage }) => {
        const { weighted, breakdown } = computeWeightedUsageFromLanguageModelUsage(usage);
        const inputTokens = getUsageInputTokens(usage, breakdown);
        finalUsageAmount += Math.ceil(
          weighted * getEffectiveTokenMultiplier(baseModel, inputTokens, { proMode, fastMode }),
        );
      },
      onFinish: ({ totalUsage }) => {
        const { weighted, breakdown } = computeWeightedUsageFromLanguageModelUsage(totalUsage);
        const inputTokens = getUsageInputTokens(totalUsage, breakdown);
        finalUsageAmount = Math.ceil(
          weighted * getEffectiveTokenMultiplier(baseModel, inputTokens, { proMode, fastMode }),
        );
      },
      providerOptions,
      system: requestSystem,
    });
  } catch (error) {
    await rollbackPendingAssistantState();
    await refundConsumedUsage();
    // Nothing streamed, so there is no reconciliation left to wait for.
    await flushMaxModeUsage();
    clearGenerationLock();
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
      hasAssistantOutput = true;
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
          if (!(await ownsCurrentGeneration())) {
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
        await settleUsage();

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
        await flushMaxModeUsage();
        clearGenerationLock();
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: consumeStream,
  });
}
