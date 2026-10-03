"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Save } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Composer, type ComposerMessage } from "@/components/chat/composer";
import { ComparisonSettingsControls } from "@/components/chat/comparison-settings";
import {
  comparisonSettingsSchema,
  normalizeComparisonSettings,
  type ComparisonSettings,
} from "@/lib/comparison-settings";
import { models } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ChatComposerModelPicker } from "@/components/chat/chat-composer-model-picker";
import { Spinner } from "@/components/ui/spinner";
import { useAvailableModels } from "@/hooks/use-available-models";
import { getComparisonTurns } from "@/lib/comparison-conversation";
import { createModelComparisonTransport } from "@/lib/model-comparison-transport";
import { trpc } from "@/lib/trpc/react";

function Answer({
  messages,
  busy,
  error,
}: {
  messages: UIMessage[];
  busy: boolean;
  error: boolean;
}) {
  const t = useExtracted();
  const text = messages
    .flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])),
    )
    .join("\n\n");
  return (
    <Message from="assistant" className="max-w-none w-full">
      <MessageContent className="w-full min-w-0">
        {text ? (
          <MessageResponse>{text}</MessageResponse>
        ) : (
          <p className="text-sm text-muted-foreground">
            {busy ? t("Generating…") : t("The answer will appear here.")}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {t("This model could not complete its answer. Try again or choose another model.")}
          </p>
        )}
      </MessageContent>
    </Message>
  );
}

type Comparison = {
  leftId: string;
  rightId: string;
  leftModel: string;
  rightModel: string;
  leftName: string;
  rightName: string;
};

export function SavedModelComparison({ id }: { id: string }) {
  const t = useExtracted();
  const saved = trpc.chat.getComparison.useQuery({ id }, { retry: false });
  if (saved.isPending) return <p className="p-4">{t("Loading…")}</p>;
  if (saved.isError)
    return (
      <div className="p-4 space-y-3">
        <p role="alert">{t("Could not load this comparison.")}</p>
        <Link href="/compare" className="underline">
          {t("Compare models")}
        </Link>
      </div>
    );
  return <ModelComparison key={id} initialComparison={saved.data} />;
}

export function ModelComparison({
  initialComparison,
}: {
  initialComparison?: inferRouterOutputs<AppRouter>["chat"]["getComparison"];
}) {
  const t = useExtracted();
  const router = useRouter();
  const { availableModels, platformCapabilities } = useAvailableModels();
  const webToolsAvailable = platformCapabilities.features.webSearch;
  const [leftSettings, setLeftSettings] = useState(() =>
    comparisonSettingsSchema.parse(initialComparison?.leftSettings ?? {}),
  );
  const [rightSettings, setRightSettings] = useState(() =>
    comparisonSettingsSchema.parse(initialComparison?.rightSettings ?? {}),
  );
  const usage = trpc.billing.usage.useQuery();
  const eligible = usage.data?.tier === "pro" || usage.data?.tier === "max";
  const [input, setInput] = useState("");
  const [leftSelection, setLeftSelection] = useState("");
  const [rightSelection, setRightSelection] = useState("");
  const leftModel =
    availableModels.find((model) => model.value === leftSelection) ?? availableModels[0];
  const rightModel =
    availableModels.find((model) => model.value === rightSelection) ??
    availableModels.find((model) => model.value !== leftModel?.value);
  const [comparison, setComparison] = useState<Comparison | null>(() =>
    initialComparison
      ? {
          leftId: crypto.randomUUID(),
          rightId: crypto.randomUUID(),
          leftModel: initialComparison.leftModel,
          rightModel: initialComparison.rightModel,
          leftName: initialComparison.leftName,
          rightName: initialComparison.rightName,
        }
      : null,
  );
  const [sessionId, setSessionId] = useState(initialComparison?.id);
  const [dirty, setDirty] = useState(false);
  const history = trpc.chat.getComparisons.useQuery();
  const saveSession = trpc.chat.saveComparisonSession.useMutation();
  const [running, setRunning] = useState(false);
  const submitLock = useRef(false);
  const saveLock = useRef(false);
  const transport = useMemo(() => createModelComparisonTransport(), []);
  const left = useChat({ transport, messages: initialComparison?.leftMessages });
  const right = useChat({ transport, messages: initialComparison?.rightMessages });
  const save = trpc.chat.saveComparison.useMutation();
  const savedIds = useRef(new Map<string, string>());
  const utils = trpc.useUtils();
  const leftTurns = getComparisonTurns(left.messages);
  const rightTurns = getComparisonTurns(right.messages);
  const limitReached = Math.max(left.messages.length, right.messages.length) >= 199;
  const modelsAvailable = comparison
    ? [comparison.leftModel, comparison.rightModel].every((value) =>
        availableModels.some((model) => model.value === value),
      )
    : Boolean(leftModel && rightModel && leftModel.value !== rightModel.value);

  async function compare(message: ComposerMessage) {
    if (
      submitLock.current ||
      saveLock.current ||
      !eligible ||
      !message.text.trim() ||
      message.files.length ||
      !modelsAvailable ||
      limitReached
    )
      return;
    const next =
      comparison ??
      (leftModel && rightModel
        ? {
            leftId: crypto.randomUUID(),
            rightId: crypto.randomUUID(),
            leftModel: leftModel.value,
            rightModel: rightModel.value,
            leftName: leftModel.name,
            rightName: rightModel.name,
          }
        : null);
    if (!next) return;
    submitLock.current = true;
    setRunning(true);
    setComparison(next);
    setDirty(true);
    setInput("");
    // Saving again after another turn must include the updated transcript.
    savedIds.current.clear();
    try {
      await Promise.allSettled([
        left.sendMessage(
          { text: message.text.trim() },
          {
            body: {
              id: next.leftId,
              model: next.leftModel,
              comparison: true,
              ...normalizeComparisonSettings(
                models.find((model) => model.value === next.leftModel),
                leftSettings,
                webToolsAvailable,
              ),
            },
          },
        ),
        right.sendMessage(
          { text: message.text.trim() },
          {
            body: {
              id: next.rightId,
              model: next.rightModel,
              comparison: true,
              ...normalizeComparisonSettings(
                models.find((model) => model.value === next.rightModel),
                rightSettings,
                webToolsAvailable,
              ),
            },
          },
        ),
      ]);
    } finally {
      submitLock.current = false;
      setRunning(false);
      void utils.billing.usage.invalidate();
    }
  }

  function reset() {
    if (submitLock.current || saveLock.current) return;
    left.setMessages([]);
    right.setMessages([]);
    savedIds.current.clear();
    setComparison(null);
    setSessionId(undefined);
    setDirty(false);
    setLeftSettings(comparisonSettingsSchema.parse({}));
    setRightSettings(comparisonSettingsSchema.parse({}));
    if (initialComparison) router.push("/compare");
    else window.history.replaceState(null, "", "/compare");
    setInput("");
  }

  async function saveWholeComparison() {
    if (saveLock.current || submitLock.current || !comparison) return;
    saveLock.current = true;
    try {
      const id = await saveSession.mutateAsync({
        id: sessionId,
        leftModel: comparison.leftModel,
        rightModel: comparison.rightModel,
        leftSettings: normalizeComparisonSettings(
          models.find((model) => model.value === comparison.leftModel),
          leftSettings,
          webToolsAvailable,
        ),
        rightSettings: normalizeComparisonSettings(
          models.find((model) => model.value === comparison.rightModel),
          rightSettings,
          webToolsAvailable,
        ),
        leftMessages: left.messages as unknown as Record<string, unknown>[],
        rightMessages: right.messages as unknown as Record<string, unknown>[],
      });
      setSessionId(id);
      setDirty(false);
      window.history.replaceState(null, "", `/compare/${id}`);
      void utils.chat.getComparisons.invalidate();
      void utils.chat.getComparison.invalidate({ id });
      toast.success(t("Comparison saved."));
    } catch {
      toast.error(t("Could not save this comparison. Please try again."));
    } finally {
      saveLock.current = false;
    }
  }

  const saving = save.isPending || saveSession.isPending;
  const canSaveSession =
    eligible &&
    dirty &&
    [left, right].every(
      (chat) =>
        chat.messages.at(-1)?.role === "assistant" &&
        chat.messages.at(-1)?.parts.some((part) => part.type === "text" && part.text.trim()),
    );

  function updateSettings(side: "left" | "right", settings: ComparisonSettings) {
    if (submitLock.current || saveLock.current || !eligible) return;
    if (side === "left") setLeftSettings(settings);
    else setRightSettings(settings);
    setDirty(true);
  }

  async function continueChat(id: string, messages: UIMessage[]) {
    if (saveLock.current || submitLock.current) return;
    saveLock.current = true;
    try {
      let savedId = savedIds.current.get(id);
      if (!savedId) {
        savedId = await save.mutateAsync({
          messages: messages as unknown as Record<string, unknown>[],
        });
        savedIds.current.set(id, savedId);
        void utils.chat.getChats.invalidate();
      }
      router.push(`/chat/${savedId}`);
    } catch {
      toast.error(t("Could not save this answer. Please try again."));
    } finally {
      saveLock.current = false;
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="mx-auto w-full max-w-6xl shrink-0 space-y-2 px-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-sm font-semibold">{t("Compare models")}</h1>
          {comparison && (
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant="outline"
                disabled={running || saving || !canSaveSession}
                onClick={() => void saveWholeComparison()}
              >
                {saveSession.isPending ? (
                  <Spinner className="size-3" />
                ) : (
                  <Save className="size-3" />
                )}
                {sessionId && !dirty ? t("Saved") : t("Save comparison")}
              </Button>
              <Button size="xs" variant="ghost" disabled={running || saving} onClick={reset}>
                {t("New comparison")}
              </Button>
            </div>
          )}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer">{t("Saved comparisons")}</summary>
          <div className="max-h-48 overflow-y-auto space-y-2 py-2">
            {history.isPending ? (
              <p>{t("Loading…")}</p>
            ) : history.isError ? (
              <p role="alert">{t("Could not load saved comparisons.")}</p>
            ) : history.data.length === 0 ? (
              <p>{t("No saved comparisons yet.")}</p>
            ) : (
              history.data.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/compare/${entry.id}`}
                  aria-current={sessionId === entry.id ? "page" : undefined}
                  className="block rounded-md border px-3 py-2 hover:bg-muted"
                  onClick={(event) => {
                    if (running || saving) event.preventDefault();
                  }}
                >
                  <span className="block truncate">{entry.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.leftName} / {entry.rightName}
                  </span>
                </Link>
              ))
            )}
          </div>
        </details>
        {(eligible || comparison) && (
          <div className="grid grid-cols-2 gap-3 border-b pb-3">
            {[
              {
                label: t("First model"),
                model: leftModel,
                change: setLeftSelection,
                name: comparison?.leftName,
                id: comparison?.leftId,
                chat: left,
                settings: leftSettings,
                side: "left" as const,
              },
              {
                label: t("Second model"),
                model: rightModel,
                change: setRightSelection,
                name: comparison?.rightName,
                id: comparison?.rightId,
                chat: right,
                settings: rightSettings,
                side: "right" as const,
              },
            ].map(({ label, model, change, name, id, chat, settings, side }) => (
              <div key={label} className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-center gap-2">
                  {name ? (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <ChatComposerModelPicker
                        model={model?.value ?? ""}
                        selectedModel={model}
                        availableModels={availableModels}
                        onModelChange={change}
                        disabled={running || saving || Boolean(comparison)}
                        ariaLabel={label}
                        className="max-w-full min-w-0"
                      />
                    </div>
                  )}
                  {id && (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t("Continue this chat")}
                      title={t("Continue this chat")}
                      disabled={
                        running ||
                        saving ||
                        !chat.messages
                          .at(-1)
                          ?.parts.some((part) => part.type === "text" && part.text.trim()) ||
                        chat.messages.at(-1)?.role !== "assistant"
                      }
                      onClick={() => void continueChat(id, chat.messages)}
                    >
                      {save.isPending ? (
                        <Spinner className="size-4" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
                    </Button>
                  )}
                </div>
                <ComparisonSettingsControls
                  model={
                    comparison
                      ? models.find(
                          (entry) =>
                            entry.value ===
                            (side === "left" ? comparison.leftModel : comparison.rightModel),
                        )
                      : model
                  }
                  settings={settings}
                  onChange={(next) => updateSettings(side, next)}
                  disabled={running || saving || !eligible}
                  webToolsAvailable={webToolsAvailable}
                />
              </div>
            ))}
          </div>
        )}
      </header>
      <Conversation className="min-h-0">
        <ConversationContent className="mx-auto w-full max-w-6xl">
          {usage.isPending ? (
            <p>{t("Loading…")}</p>
          ) : usage.isError ? (
            <p role="alert">{t("Unable to load your plan. Please try again.")}</p>
          ) : !eligible && !comparison ? (
            <div className="rounded-xl border p-6 space-y-3">
              <p>{t("Model comparison is available on Pro and Max, including team plans.")}</p>
              <Link href="/settings/billing" className="underline">
                {t("View plans")}
              </Link>
            </div>
          ) : leftTurns.length === 0 ? (
            <ConversationEmptyState>
              <div className="max-w-lg space-y-3 text-center text-sm text-muted-foreground">
                <p>
                  {t(
                    "Continue the conversation with both models. Each model keeps its own context and uses your existing quota.",
                  )}
                </p>
                <p className="text-xs">
                  {t(
                    "Save both conversations with Save comparison and reopen them from Saved comparisons. Continue this chat saves only one model's conversation. Unsaved changes are lost when you leave.",
                  )}
                </p>
              </div>
            </ConversationEmptyState>
          ) : (
            leftTurns.map((turn, index) => {
              const latest = index === leftTurns.length - 1;
              return (
                <div key={turn.question.id} className="space-y-4">
                  <Message from="user">
                    <MessageContent className="whitespace-pre-wrap break-words">
                      {turn.question.parts
                        .flatMap((part) => (part.type === "text" ? [part.text] : []))
                        .join("\n")}
                    </MessageContent>
                  </Message>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      { name: comparison?.leftName, answers: turn.answers, chat: left },
                      {
                        name: comparison?.rightName,
                        answers: rightTurns[index]?.answers ?? [],
                        chat: right,
                      },
                    ].map(({ name, answers, chat }, side) => (
                      <article
                        key={side}
                        className="min-w-0 rounded-xl border bg-card p-4 space-y-3"
                        aria-label={name}
                      >
                        <h2 className="text-xs font-medium text-muted-foreground">{name}</h2>
                        <Answer
                          messages={answers}
                          busy={
                            latest && (chat.status === "submitted" || chat.status === "streaming")
                          }
                          error={latest && Boolean(chat.error)}
                        />
                      </article>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label={t("Scroll to bottom")} />
      </Conversation>
      {eligible && (
        <div className="mx-auto w-full max-w-6xl shrink-0 space-y-2 px-4 pb-4 pt-2">
          {!modelsAvailable && (
            <p className="text-sm text-muted-foreground">{t("Choose two different models.")}</p>
          )}
          {limitReached && (
            <p className="text-sm text-muted-foreground">
              {t("Start a new comparison to continue.")}
            </p>
          )}
          <Composer
            value={input}
            onValueChange={setInput}
            onSubmit={(message) => void compare(message)}
            onStop={() => {
              void left.stop();
              void right.stop();
            }}
            placeholder={t("Ask both models…")}
            status={running ? "streaming" : "ready"}
            attachmentsEnabled={false}
            compact
            globalDrop={false}
            isSubmitDisabled={saving || !modelsAvailable || limitReached || !input.trim()}
          />
        </div>
      )}
    </section>
  );
}
