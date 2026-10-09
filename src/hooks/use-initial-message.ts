import type { useChat } from "@ai-sdk/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { models, resolveReasoningEffort, type ReasoningEffort } from "@/lib/constants";

const INITIAL_MESSAGE_STORAGE_KEY = "deni_initial_message:v1";

type SendMessage = ReturnType<typeof useChat>["sendMessage"];

type StoredInitialMessage = {
  text: string;
  files?: Array<{
    type?: "file";
    filename?: string;
    mediaType?: string;
    url?: string;
  }>;
  webSearch: boolean;
  model?: string;
  reasoningEffort?: string;
  proMode?: boolean;
  fastMode?: boolean;
  deepResearch?: boolean;
  projectId?: string | null;
};

export type InitialComposerSeed = {
  webSearch: boolean;
  model?: string;
  reasoningEffort: ReasoningEffort;
  proMode: boolean;
  fastMode: boolean;
  deepResearch: boolean;
  projectId?: string | null;
};

type StoreListener = () => void;

const listeners = new Set<StoreListener>();
let cachedStoredRaw: string | null = null;
let cachedStoredValue: StoredInitialMessage | null = null;

function emitInitialMessageStore() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeInitialMessageStore(onStoreChange: StoreListener) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function parseStoredInitialMessage(raw: string): StoredInitialMessage | null {
  try {
    const parsed = JSON.parse(raw) as StoredInitialMessage;
    if (!parsed || typeof parsed.text !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getServerStoredSnapshot(): StoredInitialMessage | null {
  return null;
}

function readStoredInitialMessage(): StoredInitialMessage | null {
  if (typeof window === "undefined") {
    return null;
  }
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(INITIAL_MESSAGE_STORAGE_KEY);
  } catch {
    // Blocked storage (private mode, site data disabled) throws; this runs during render.
    return null;
  }
  if (raw === cachedStoredRaw) {
    return cachedStoredValue;
  }
  cachedStoredRaw = raw;
  cachedStoredValue = raw ? parseStoredInitialMessage(raw) : null;
  return cachedStoredValue;
}

function seedFromStored(
  stored: StoredInitialMessage,
  fallbackModel: string,
  availableModelValues?: ReadonlySet<string>,
): InitialComposerSeed {
  const effectiveModel =
    stored.model && (!availableModelValues || availableModelValues.has(stored.model))
      ? stored.model
      : fallbackModel;
  const selectedModel = models.find((entry) => entry.value === effectiveModel);
  return {
    webSearch: Boolean(stored.webSearch),
    // Only a stored model that is available; otherwise leave it to the project or app default.
    model: effectiveModel === stored.model ? stored.model : undefined,
    reasoningEffort:
      resolveReasoningEffort(selectedModel?.efforts ?? false, stored.reasoningEffort) ?? "high",
    proMode: Boolean(stored.proMode && selectedModel?.supportsProMode),
    fastMode: Boolean(stored.fastMode && selectedModel?.supportsFastMode),
    deepResearch: Boolean(stored.deepResearch),
    projectId: stored.projectId ?? null,
  };
}

export function useInitialMessage(params: {
  id: string;
  initialMessagesLength: number;
  model: string;
  availableModelValues?: ReadonlySet<string>;
  sendMessage: SendMessage;
  onMessageSent: () => void;
  /** Prefills the composer with a `?message=` prompt without sending it. */
  onDraft: (text: string) => void;
}): InitialComposerSeed | null {
  const {
    id,
    initialMessagesLength,
    model,
    availableModelValues,
    sendMessage,
    onMessageSent,
    onDraft,
  } = params;
  const searchParams = useSearchParams();
  const stored = useSyncExternalStore(
    subscribeInitialMessageStore,
    readStoredInitialMessage,
    getServerStoredSnapshot,
  );

  const initialMessageSentRef = useRef(false);
  const sendMessageRef = useRef(sendMessage);
  const onMessageSentRef = useRef(onMessageSent);
  const onDraftRef = useRef(onDraft);
  const modelRef = useRef(model);
  const availableModelValuesRef = useRef(availableModelValues);
  const [consumedSeed, setConsumedSeed] = useState<{
    id: string;
    seed: InitialComposerSeed;
  } | null>(null);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
    onMessageSentRef.current = onMessageSent;
    onDraftRef.current = onDraft;
    modelRef.current = model;
    availableModelValuesRef.current = availableModelValues;
  });

  const queryMessage = searchParams.get("message");
  const queryWebSearch = searchParams.get("webSearch") === "true";
  const liveSeed = stored
    ? seedFromStored(stored, model, availableModelValues)
    : queryMessage
      ? {
          webSearch: queryWebSearch,
          reasoningEffort: "high" as const,
          proMode: false,
          fastMode: false,
          deepResearch: false,
        }
      : consumedSeed?.id === id
        ? consumedSeed.seed
        : null;

  useEffect(() => {
    if (initialMessageSentRef.current || initialMessagesLength > 0) {
      return;
    }

    const storedData = readStoredInitialMessage();
    if (storedData) {
      initialMessageSentRef.current = true;
      setConsumedSeed({
        id,
        seed: seedFromStored(storedData, modelRef.current, availableModelValuesRef.current),
      });
      try {
        sessionStorage.removeItem(INITIAL_MESSAGE_STORAGE_KEY);
      } catch {
        // Nothing to clear when storage is unavailable.
      }
      emitInitialMessageStore();

      const files = Array.isArray(storedData.files)
        ? storedData.files.filter(
            (file): file is { type: "file"; filename?: string; mediaType: string; url: string } =>
              Boolean(file?.url && file?.mediaType),
          )
        : [];

      const sendModel =
        storedData.model &&
        (!availableModelValuesRef.current || availableModelValuesRef.current.has(storedData.model))
          ? storedData.model
          : modelRef.current;
      const sendSelected = models.find((entry) => entry.value === sendModel);
      const parsedReasoningEffort =
        resolveReasoningEffort(sendSelected?.efforts ?? false, storedData.reasoningEffort) ??
        "high";
      const parsedProMode = Boolean(storedData.proMode && sendSelected?.supportsProMode);
      const parsedFastMode = Boolean(storedData.fastMode && sendSelected?.supportsFastMode);

      Promise.resolve(
        sendMessageRef.current(
          {
            text: storedData.text,
            files: files.length > 0 ? files : undefined,
          },
          {
            body: {
              model: sendModel,
              webSearch: storedData.webSearch,
              reasoningEffort: parsedReasoningEffort,
              proMode: parsedProMode,
              fastMode: parsedFastMode,
              deepResearch: storedData.deepResearch ?? false,
              id,
            },
          },
        ),
      ).finally(() => {
        onMessageSentRef.current();
      });
      return;
    }

    const initialMessage = searchParams.get("message");
    if (!initialMessage) {
      return;
    }

    // Anyone can link to `/new/<prompt>` or `/chat/<id>?message=`, including from
    // native apps where the navigation looks user-initiated. Never send a URL-supplied
    // prompt on the user's behalf: it could spend their quota or plant memories and
    // tool calls. Prefill it so the user reviews and sends it themselves.
    initialMessageSentRef.current = true;
    const initialWebSearch = searchParams.get("webSearch") === "true";
    setConsumedSeed({
      id,
      seed: {
        webSearch: initialWebSearch,
        reasoningEffort: "high",
        proMode: false,
        fastMode: false,
        deepResearch: false,
      },
    });

    window.history.replaceState({}, "", `/chat/${id}`);
    emitInitialMessageStore();
    // Search params are already decoded; literal percent escapes belong to the prompt.
    onDraftRef.current(initialMessage);
  }, [searchParams, initialMessagesLength, id]);

  return liveSeed;
}
