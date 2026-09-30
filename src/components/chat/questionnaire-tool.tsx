"use client";

import type { ToolUIPart, UIMessage } from "ai";
import { ChevronDownIcon, CircleCheckIcon } from "lucide-react";
import { useExtracted } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Spinner } from "@/components/ui/spinner";
import {
  uniqueQuestionnaireParts,
  type QuestionnaireToolAnswer,
  type QuestionnaireToolInput,
  type QuestionnaireToolOutput,
} from "@/lib/chat-tools/questionnaire";

export type QuestionnaireToolPart = ToolUIPart & { type: "tool-questionnaire" };

export function isQuestionnaireToolPart(
  part: UIMessage["parts"][number],
): part is QuestionnaireToolPart {
  return part.type === "tool-questionnaire";
}

type QuestionnaireToolInputQuestion = QuestionnaireToolInput["questions"][number];

type QuestionnaireToolChoice = NonNullable<QuestionnaireToolInputQuestion["choices"]>[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isQuestionnaireInput(value: unknown): value is QuestionnaireToolInput {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    value.title.trim().length === 0 ||
    !Array.isArray(value.questions)
  ) {
    return false;
  }

  const names = new Set<string>();
  return (
    value.questions.length > 0 &&
    value.questions.length <= 8 &&
    value.questions.every((question) => {
      if (
        !isRecord(question) ||
        typeof question.name !== "string" ||
        !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(question.name) ||
        names.has(question.name) ||
        typeof question.prompt !== "string" ||
        question.prompt.trim().length === 0 ||
        (question.description !== undefined && typeof question.description !== "string") ||
        (question.required !== undefined && typeof question.required !== "boolean") ||
        (question.multiple !== undefined && typeof question.multiple !== "boolean")
      ) {
        return false;
      }

      names.add(question.name);

      if (question.choices !== undefined) {
        if (!Array.isArray(question.choices) || question.choices.length > 8) {
          return false;
        }

        const values = new Set<string>();
        for (const choice of question.choices) {
          if (
            !isRecord(choice) ||
            typeof choice.value !== "string" ||
            choice.value.length === 0 ||
            typeof choice.label !== "string" ||
            choice.label.trim().length === 0 ||
            (choice.description !== undefined && typeof choice.description !== "string") ||
            values.has(choice.value)
          ) {
            return false;
          }
          values.add(choice.value);
        }
      }

      return (
        question.input === undefined ||
        (isRecord(question.input) &&
          typeof question.input.label === "string" &&
          question.input.label.trim().length > 0 &&
          (question.input.placeholder === undefined ||
            typeof question.input.placeholder === "string"))
      );
    })
  );
}

function QuestionnaireProgress({ current, total }: { current: number; total: number }) {
  const t = useExtracted();

  return (
    <div className="flex items-center gap-3">
      <progress
        aria-label={t("Questionnaire progress")}
        className="h-2 flex-1 accent-primary"
        max={total}
        value={current}
      />
      <span aria-live="polite" className="shrink-0 text-xs text-muted-foreground">
        {t("Question {current} of {total}", {
          current: String(current),
          total: String(total),
        })}
      </span>
    </div>
  );
}

function QuestionnaireForm({
  toolCallId,
  questionnaire,
  onComplete,
}: {
  toolCallId: string;
  questionnaire: QuestionnaireToolInput;
  onComplete: (toolCallId: string, output: QuestionnaireToolOutput) => void;
}) {
  const t = useExtracted();
  const id = useId();
  const legendRef = useRef<HTMLLegendElement>(null);
  const firstControlRef = useRef<HTMLInputElement>(null);
  const previousIndexRef = useRef(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [freeformAnswers, setFreeformAnswers] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const question = questionnaire.questions[currentIndex];
  const isLast = currentIndex === questionnaire.questions.length - 1;
  const isMultiple = question.multiple === true;
  const currentAnswer = answers[question.name];
  const selectedValues = Array.isArray(currentAnswer)
    ? currentAnswer
    : typeof currentAnswer === "string"
      ? [currentAnswer]
      : [];
  const freeformValue = freeformAnswers[question.name] ?? "";
  const isAnswered = isMultiple
    ? selectedValues.length > 0 || freeformValue.trim().length > 0
    : (typeof currentAnswer === "string" && currentAnswer.trim().length > 0) ||
      freeformValue.trim().length > 0;
  const canContinue = isAnswered || skipped[question.name] === true;
  const questionId = `${id}-${question.name}`;
  const descriptionId = `${questionId}-description`;
  const errorId = `${questionId}-error`;

  useEffect(() => {
    if (previousIndexRef.current === currentIndex) {
      return;
    }
    previousIndexRef.current = currentIndex;
    legendRef.current?.focus();
  }, [currentIndex]);

  function buildOutput(skippedQuestionName?: string): QuestionnaireToolOutput {
    const outputAnswers: QuestionnaireToolAnswer[] = questionnaire.questions.map((item) => {
      if (item.name === skippedQuestionName || skipped[item.name]) {
        return { name: item.name, status: "skipped" };
      }

      const answer = answers[item.name];
      const freeform = freeformAnswers[item.name]?.trim() ?? "";
      if (item.multiple) {
        const values = Array.isArray(answer) ? [...answer] : [];
        if (freeform) values.push(freeform);
        return { name: item.name, status: "answered", value: values };
      }

      const value = freeform || (typeof answer === "string" ? answer : "");
      return { name: item.name, status: "answered", value };
    });

    return {
      status: "submitted",
      title: questionnaire.title,
      answers: outputAnswers,
    };
  }

  function complete(skippedQuestionName?: string) {
    setIsSubmitting(true);
    setError(null);
    onComplete(toolCallId, buildOutput(skippedQuestionName));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canContinue) {
      setError(t("Please answer this question or skip it to continue."));
      firstControlRef.current?.focus();
      return;
    }

    setError(null);
    if (isLast) {
      complete();
    } else {
      setCurrentIndex((index) => index + 1);
    }
  }

  function handleSkip() {
    setError(null);
    if (isLast) {
      complete(question.name);
      return;
    }

    setSkipped((current) => ({ ...current, [question.name]: true }));
    setCurrentIndex((index) => index + 1);
  }

  function handleChoiceChange(choice: QuestionnaireToolChoice, checked: boolean) {
    setSkipped((current) => ({ ...current, [question.name]: false }));
    setError(null);

    if (isMultiple) {
      setAnswers((current) => {
        const existing = Array.isArray(current[question.name])
          ? (current[question.name] as string[])
          : [];
        const next = checked
          ? [...existing, choice.value]
          : existing.filter((value) => value !== choice.value);
        return { ...current, [question.name]: next };
      });
      return;
    }

    if (checked) {
      setAnswers((current) => ({ ...current, [question.name]: choice.value }));
      setFreeformAnswers((current) => ({ ...current, [question.name]: "" }));
    }
  }

  function handleFreeformChange(value: string) {
    setSkipped((current) => ({ ...current, [question.name]: false }));
    setError(null);
    setFreeformAnswers((current) => ({ ...current, [question.name]: value }));
    if (!isMultiple) {
      setAnswers((current) => ({ ...current, [question.name]: "" }));
    }
  }

  const choices = question.choices ?? [];
  const freeformInput = question.input ?? {
    label: t("Your answer"),
    placeholder: "",
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <QuestionnaireProgress current={currentIndex + 1} total={questionnaire.questions.length} />

      <fieldset
        aria-describedby={
          [question.description ? descriptionId : null, error ? errorId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className="flex flex-col gap-3"
      >
        <legend
          className="w-full text-base font-medium text-foreground"
          ref={legendRef}
          tabIndex={-1}
        >
          <span>{question.prompt}</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {question.required ? t("Required") : t("Optional")}
          </span>
        </legend>
        {question.description ? (
          <p className="text-sm text-muted-foreground" id={descriptionId}>
            {question.description}
          </p>
        ) : null}

        {choices.length > 0 ? (
          <div className="flex flex-col gap-2">
            {choices.map((choice, choiceIndex) => {
              const choiceId = `${questionId}-choice-${choiceIndex}`;
              const checked = isMultiple
                ? selectedValues.includes(choice.value)
                : currentAnswer === choice.value;

              return (
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  htmlFor={choiceId}
                  key={`${choice.value}-${choiceIndex}`}
                >
                  <input
                    aria-invalid={Boolean(error) || undefined}
                    checked={checked}
                    ref={choiceIndex === 0 ? firstControlRef : undefined}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    disabled={isSubmitting}
                    id={choiceId}
                    name={`${id}-${question.name}`}
                    onChange={(event) => handleChoiceChange(choice, event.currentTarget.checked)}
                    type={isMultiple ? "checkbox" : "radio"}
                    value={choice.value}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{choice.label}</span>
                    {choice.description ? (
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {choice.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}

        {question.input || choices.length === 0 ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor={`${questionId}-freeform`}>
              {freeformInput.label}
            </label>
            <Input
              aria-invalid={Boolean(error) || undefined}
              autoComplete="off"
              ref={choices.length === 0 ? firstControlRef : undefined}
              disabled={isSubmitting}
              id={`${questionId}-freeform`}
              onChange={(event) => handleFreeformChange(event.currentTarget.value)}
              placeholder={freeformInput.placeholder}
              value={freeformValue}
            />
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          disabled={currentIndex === 0 || isSubmitting}
          onClick={() => {
            setError(null);
            setCurrentIndex((index) => Math.max(0, index - 1));
          }}
          type="button"
          variant="outline"
        >
          {t("Previous")}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!question.required ? (
            <Button disabled={isSubmitting} onClick={handleSkip} type="button" variant="ghost">
              {t("Skip this question")}
            </Button>
          ) : null}
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <>
                <Spinner className="size-4" />
                {t("Sending answers...")}
              </>
            ) : isLast ? (
              t("Submit answers")
            ) : (
              t("Next")
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

function QuestionnaireCard({
  part,
  isInteractive,
  onComplete,
}: {
  part: QuestionnaireToolPart;
  isInteractive: boolean;
  onComplete: (toolCallId: string, output: QuestionnaireToolOutput) => void;
}) {
  const t = useExtracted();
  const input = isQuestionnaireInput(part.input) ? part.input : null;

  if (part.state === "output-available") {
    const output = part.output;
    const answers =
      isRecord(output) && output.status === "submitted" && Array.isArray(output.answers)
        ? output.answers
        : null;

    return (
      <Message from="assistant">
        <MessageContent className="w-full">
          {input && answers ? (
            <details className="group w-fit min-w-56 max-w-full rounded-xl border border-border/70 bg-muted/40 open:w-full open:max-w-lg">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <CircleCheckIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{input.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t("Answered")}</span>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="border-t border-border/70 px-4 py-3">
                <dl className="space-y-3">
                  {input.questions.map((question) => {
                    const answer = answers.find(
                      (item): item is QuestionnaireToolAnswer =>
                        isRecord(item) &&
                        item.name === question.name &&
                        (item.status === "skipped" || item.status === "answered"),
                    );
                    const values =
                      answer?.status === "answered"
                        ? Array.isArray(answer.value)
                          ? answer.value
                          : [answer.value]
                        : [];
                    const labels = values
                      .filter((value): value is string => typeof value === "string" && !!value)
                      .map(
                        (value) =>
                          question.choices?.find((choice) => choice.value === value)?.label ??
                          value,
                      );

                    return (
                      <div key={question.name}>
                        <dt className="text-xs text-muted-foreground">{question.prompt}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                          {labels.length > 0
                            ? labels.join(", ")
                            : answer?.status === "skipped"
                              ? t("Skipped")
                              : t("No answer")}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            </details>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              {answers ? (
                <CircleCheckIcon aria-hidden="true" className="size-3.5 text-primary" />
              ) : null}
              {answers ? t("Answered") : t("This questionnaire is no longer active.")}
            </span>
          )}
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message from="assistant">
      <MessageContent className="w-full">
        <Card className="w-full gap-0 py-0">
          {part.state === "input-streaming" ? (
            <CardContent className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              {t("Preparing questionnaire...")}
            </CardContent>
          ) : part.state === "input-available" ? (
            input && isInteractive ? (
              <>
                <CardHeader className="gap-2 border-b py-5">
                  <CardTitle role="heading" aria-level={2} className="text-base leading-snug">
                    {input.title}
                  </CardTitle>
                  {input.description ? (
                    <CardDescription>{input.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="py-5">
                  <QuestionnaireForm
                    key={part.toolCallId}
                    onComplete={onComplete}
                    questionnaire={input}
                    toolCallId={part.toolCallId}
                  />
                </CardContent>
              </>
            ) : input ? (
              <CardContent className="py-5">
                <p className="text-sm text-muted-foreground" role="status">
                  {t("This questionnaire is no longer active.")}
                </p>
              </CardContent>
            ) : (
              <CardContent className="flex flex-col items-start gap-3 py-5">
                <p className="text-sm text-destructive" role="alert">
                  {t(
                    "This questionnaire could not be displayed because its questions are invalid.",
                  )}
                </p>
                {isInteractive ? (
                  <Button
                    onClick={() =>
                      onComplete(part.toolCallId, {
                        status: "unavailable",
                        reason: "The generated questionnaire contained invalid question data.",
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    {t("Continue without answers")}
                  </Button>
                ) : null}
              </CardContent>
            )
          ) : part.state === "output-error" ? (
            <CardContent className="py-5">
              <p className="text-sm text-destructive" role="alert">
                {t("The questionnaire could not be submitted. Please try again.")}
              </p>
            </CardContent>
          ) : null}
        </Card>
      </MessageContent>
    </Message>
  );
}

export function AssistantMessageQuestionnaireParts({
  parts,
  isInteractive,
  onComplete,
}: {
  parts: QuestionnaireToolPart[];
  isInteractive: boolean;
  onComplete: (toolCallId: string, output: QuestionnaireToolOutput) => void;
}) {
  return (
    <>
      {uniqueQuestionnaireParts(parts).map((part) => (
        <QuestionnaireCard
          isInteractive={isInteractive}
          key={part.toolCallId}
          part={part}
          onComplete={onComplete}
        />
      ))}
    </>
  );
}
