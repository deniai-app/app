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

function SavedComparisonsList({
  history,
  activeId,
  locked,
}: {
  history: {
    isPending: boolean;
    isError: boolean;
    data?: inferRouterOutputs<AppRouter>["chat"]["getComparisons"];
  };
  activeId: string | undefined;
  locked: boolean;
}) {
  const t = useExtracted();

  return (
    <details className="text-sm">
      <summary className="cursor-pointer">{t("Saved comparisons")}</summary>
      <div className="max-h-48 overflow-y-auto space-y-2 py-2">
        {history.isPending ? (
          <p>{t("Loading…")}</p>
        ) : history.isError ? (
          <p role="alert">{t("Could not load saved comparisons.")}</p>
        ) : !history.data?.length ? (
          <p>{t("No saved comparisons yet.")}</p>
        ) : (
          history.data?.map((entry) => (
            <Link
              key={entry.id}
              href={`/compare/${entry.id}`}
              aria-current={activeId === entry.id ? "page" : undefined}
              className="block rounded-md border px-3 py-2 hover:bg-muted"
              onClick={(event) => {
                if (locked) event.preventDefault();
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
  );
}

function ComparisonAccessNotice({
  isAnonymous,
  billingEnabled,
  usage,
  hasComparison,
}: {
  isAnonymous: boolean;
  billingEnabled: boolean;
  usage: { isPending: boolean; isError: boolean };
  hasComparison: boolean;
}) {
  const t = useExtracted();

  if (isAnonymous && !hasComparison) {
    return (
      <div className="space-y-3 rounded-xl border p-6">
        <p>
          {t("Log in and upgrade to Pro or Max (Team plans also available) to compare models.")}
        </p>
        <div className="flex flex-wrap gap-2">
          {billingEnabled && (
            <Button
              render={<Link href="/auth/sign-in?redirectTo=/settings/billing" />}
              nativeButton={false}
            >
              {t("Upgrade plan")}
              <ArrowUpRight className="size-3.5" />
            </Button>
          )}
          <Button
            variant="outline"
            render={<Link href="/auth/sign-in?redirectTo=/compare" />}
            nativeButton={false}
          >
            {t("Log in")}
          </Button>
        </div>
      </div>
    );
  }
  if (usage.isPending) return <p>{t("Loading…")}</p>;
  if (usage.isError) return <p role="alert">{t("Unable to load your plan. Please try again.")}</p>;
  return (
    <div className="rounded-xl border p-6 space-y-3">
      <p>{t("Model comparison is available on Pro and Max, including team plans.")}</p>
      {billingEnabled && (
        <Button render={<Link href="/settings/billing" />} nativeButton={false}>
          {t("Upgrade plan")}
          <ArrowUpRight className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

type ComparisonChat = ReturnType<typeof useChat>;
type ComparisonTurn = ReturnType<typeof getComparisonTurns>[number];

function ComparisonModelColumn({
  label,
  model,
  availableModels,
  onModelChange,
  name,
  chatId,
  chat,
  settings,
  settingsModel,
  locked,
  pickerDisabled,
  settingsDisabled,
  continuePending,
  webToolsAvailable,
  onSettingsChange,
  onContinue,
}: {
  label: string;
  model: (typeof models)[number] | undefined;
  availableModels: (typeof models)[number][];
  onModelChange: (value: string) => void;
  name: string | undefined;
  chatId: string | undefined;
  chat: ComparisonChat;
  settings: ComparisonSettings;
  settingsModel: (typeof models)[number] | undefined;
  locked: boolean;
  pickerDisabled: boolean;
  settingsDisabled: boolean;
  continuePending: boolean;
  webToolsAvailable: boolean;
  onSettingsChange: (settings: ComparisonSettings) => void;
  onContinue: () => void;
}) {
  const t = useExtracted();
  const lastMessage = chat.messages.at(-1);
  const canContinue =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some((part) => part.type === "text" && part.text.trim());

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex min-w-0 items-center gap-2">
        {name ? (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        ) : (
          <div className="min-w-0 flex-1">
            <ChatComposerModelPicker
              model={model?.value ?? ""}
              selectedModel={model}
              availableModels={availableModels}
              onModelChange={onModelChange}
              disabled={pickerDisabled}
              ariaLabel={label}
              className="max-w-full min-w-0"
            />
          </div>
        )}
        {chatId && (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("Continue this chat")}
            title={t("Continue this chat")}
            disabled={locked || !canContinue}
            onClick={onContinue}
          >
            {continuePending ? <Spinner className="size-4" /> : <ArrowUpRight className="size-4" />}
          </Button>
        )}
      </div>
      <ComparisonSettingsControls
        model={settingsModel}
        settings={settings}
        onChange={onSettingsChange}
        disabled={settingsDisabled}
        webToolsAvailable={webToolsAvailable}
      />
    </div>
  );
}

function ComparisonToolbar({
  running,
  saving,
  canSave,
  savePending,
  saved,
  onSave,
  onReset,
}: {
  running: boolean;
  saving: boolean;
  canSave: boolean;
  savePending: boolean;
  saved: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const t = useExtracted();

  return (
    <div className="flex items-center gap-2">
      <Button size="xs" variant="outline" disabled={running || saving || !canSave} onClick={onSave}>
        {savePending ? <Spinner className="size-3" /> : <Save className="size-3" />}
        {saved ? t("Saved") : t("Save comparison")}
      </Button>
      <Button size="xs" variant="ghost" disabled={running || saving} onClick={onReset}>
        {t("New comparison")}
      </Button>
    </div>
  );
}

function ComparisonComposerBar({
  input,
  onInputChange,
  onSubmit,
  onStop,
  running,
  submitDisabled,
  modelsAvailable,
  limitReached,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (message: ComposerMessage) => void;
  onStop: () => void;
  running: boolean;
  submitDisabled: boolean;
  modelsAvailable: boolean;
  limitReached: boolean;
}) {
  const t = useExtracted();

  return (
    <div className="mx-auto w-full max-w-6xl shrink-0 space-y-2 px-4 pb-4 pt-2">
      {!modelsAvailable && (
        <p className="text-sm text-muted-foreground">{t("Choose two different models.")}</p>
      )}
      {limitReached && (
        <p className="text-sm text-muted-foreground">{t("Start a new comparison to continue.")}</p>
      )}
      <Composer
        value={input}
        onValueChange={onInputChange}
        onSubmit={onSubmit}
        onStop={onStop}
        placeholder={t("Ask both models…")}
        status={running ? "streaming" : "ready"}
        attachmentsEnabled={false}
        compact
        globalDrop={false}
        isSubmitDisabled={submitDisabled}
      />
    </div>
  );
}

function ComparisonTurns({
  leftTurns,
  rightTurns,
  comparison,
  left,
  right,
}: {
  leftTurns: ComparisonTurn[];
  rightTurns: ComparisonTurn[];
  comparison: Comparison | null;
  left: ComparisonChat;
  right: ComparisonChat;
}) {
  return leftTurns.map((turn, index) => {
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
                busy={latest && (chat.status === "submitted" || chat.status === "streaming")}
                error={latest && Boolean(chat.error)}
              />
            </article>
          ))}
        </div>
      </div>
    );
  });
}

function useModelComparison(
  initialComparison?: inferRouterOutputs<AppRouter>["chat"]["getComparison"],
) {
  const t = useExtracted();
  const router = useRouter();
  const { availableModels, platformCapabilities, isAnonymous } = useAvailableModels();
  const billingEnabled = platformCapabilities.features.billing;
  const webToolsAvailable = platformCapabilities.features.webSearch;
  const [leftSettings, setLeftSettings] = useState(() =>
    comparisonSettingsSchema.parse(initialComparison?.leftSettings ?? {}),
  );
  const [rightSettings, setRightSettings] = useState(() =>
    comparisonSettingsSchema.parse(initialComparison?.rightSettings ?? {}),
  );
  const usage = trpc.billing.usage.useQuery(undefined, { enabled: !isAnonymous });
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
    // Promise.finally instead of try/finally keeps this function compilable by React Compiler.
    await Promise.resolve()
      .then(() =>
        Promise.allSettled([
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
        ]),
      )
      .finally(() => {
        submitLock.current = false;
        setRunning(false);
        void utils.billing.usage.invalidate();
      });
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
    await Promise.resolve()
      .then(() =>
        saveSession.mutateAsync({
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
        }),
      )
      .then(
        (id) => {
          setSessionId(id);
          setDirty(false);
          window.history.replaceState(null, "", `/compare/${id}`);
          void utils.chat.getComparisons.invalidate();
          void utils.chat.getComparison.invalidate({ id });
          toast.success(t("Comparison saved."));
        },
        () => toast.error(t("Could not save this comparison. Please try again.")),
      )
      .finally(() => {
        saveLock.current = false;
      });
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
    await Promise.resolve()
      .then(async () => {
        let savedId = savedIds.current.get(id);
        if (!savedId) {
          savedId = await save.mutateAsync({
            messages: messages as unknown as Record<string, unknown>[],
          });
          savedIds.current.set(id, savedId);
          void utils.chat.getChats.invalidate();
        }
        router.push(`/chat/${savedId}`);
      })
      .catch(() => toast.error(t("Could not save this answer. Please try again.")))
      .finally(() => {
        saveLock.current = false;
      });
  }

  const showAccessNotice =
    (isAnonymous && !comparison) || usage.isPending || usage.isError || (!eligible && !comparison);

  return {
    availableModels,
    billingEnabled,
    canSaveSession,
    compare,
    comparison,
    continueChat,
    dirty,
    eligible,
    history,
    input,
    isAnonymous,
    left,
    leftModel,
    leftSettings,
    leftTurns,
    limitReached,
    modelsAvailable,
    reset,
    right,
    rightModel,
    rightSettings,
    rightTurns,
    running,
    save,
    saveSession,
    saveWholeComparison,
    saving,
    sessionId,
    setInput,
    setLeftSelection,
    setRightSelection,
    updateSettings,
    usage,
    showAccessNotice,
    webToolsAvailable,
  };
}

function ComparisonEmptyState() {
  const t = useExtracted();

  return (
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
  );
}

type ComparisonState = ReturnType<typeof useModelComparison>;

function ComparisonModelGrid({ state }: { state: ComparisonState }) {
  const t = useExtracted();
  const {
    availableModels,
    comparison,
    continueChat,
    eligible,
    left,
    leftModel,
    leftSettings,
    right,
    rightModel,
    rightSettings,
    running,
    save,
    saving,
    setLeftSelection,
    setRightSelection,
    updateSettings,
    webToolsAvailable,
  } = state;

  return (
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
        <ComparisonModelColumn
          key={label}
          label={label}
          model={model}
          availableModels={availableModels}
          onModelChange={change}
          name={name}
          chatId={id}
          chat={chat}
          settings={settings}
          settingsModel={
            comparison
              ? models.find(
                  (entry) =>
                    entry.value ===
                    (side === "left" ? comparison.leftModel : comparison.rightModel),
                )
              : model
          }
          locked={running || saving}
          pickerDisabled={running || saving || Boolean(comparison)}
          settingsDisabled={running || saving || !eligible}
          continuePending={save.isPending}
          webToolsAvailable={webToolsAvailable}
          onSettingsChange={(next) => updateSettings(side, next)}
          onContinue={() => id && void continueChat(id, chat.messages)}
        />
      ))}
    </div>
  );
}

export function ModelComparison({
  initialComparison,
}: {
  initialComparison?: inferRouterOutputs<AppRouter>["chat"]["getComparison"];
}) {
  const state = useModelComparison(initialComparison);
  const {
    billingEnabled,
    canSaveSession,
    compare,
    comparison,
    dirty,
    eligible,
    history,
    input,
    isAnonymous,
    left,
    leftTurns,
    limitReached,
    modelsAvailable,
    reset,
    right,
    rightTurns,
    running,
    saveSession,
    saveWholeComparison,
    saving,
    sessionId,
    setInput,
    usage,
    showAccessNotice,
  } = state;
  const t = useExtracted();

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="mx-auto w-full max-w-6xl shrink-0 space-y-2 px-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-sm font-semibold">{t("Compare models")}</h1>
          {comparison && (
            <ComparisonToolbar
              running={running}
              saving={saving}
              canSave={canSaveSession}
              savePending={saveSession.isPending}
              saved={Boolean(sessionId) && !dirty}
              onSave={() => void saveWholeComparison()}
              onReset={reset}
            />
          )}
        </div>
        <SavedComparisonsList history={history} activeId={sessionId} locked={running || saving} />
        {(eligible || comparison) && <ComparisonModelGrid state={state} />}
      </header>
      <Conversation className="min-h-0">
        <ConversationContent className="mx-auto w-full max-w-6xl">
          {showAccessNotice ? (
            <ComparisonAccessNotice
              isAnonymous={isAnonymous}
              billingEnabled={billingEnabled}
              usage={usage}
              hasComparison={Boolean(comparison)}
            />
          ) : leftTurns.length === 0 ? (
            <ComparisonEmptyState />
          ) : (
            <ComparisonTurns
              leftTurns={leftTurns}
              rightTurns={rightTurns}
              comparison={comparison}
              left={left}
              right={right}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label={t("Scroll to bottom")} />
      </Conversation>
      {eligible && (
        <ComparisonComposerBar
          input={input}
          onInputChange={setInput}
          onSubmit={(message) => void compare(message)}
          onStop={() => {
            void left.stop();
            void right.stop();
          }}
          running={running}
          submitDisabled={saving || !modelsAvailable || limitReached || !input.trim()}
          modelsAvailable={modelsAvailable}
          limitReached={limitReached}
        />
      )}
    </section>
  );
}
