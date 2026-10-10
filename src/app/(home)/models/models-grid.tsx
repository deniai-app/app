import { AlertTriangle, Coins } from "lucide-react";
import { useExtracted, useLocale } from "next-intl";
import {
  OPENAI_LONG_CONTEXT_INPUT_THRESHOLD,
  OPENAI_LONG_CONTEXT_MULTIPLIER,
  OPENAI_FAST_MODE_MULTIPLIER,
  OPENAI_PRO_MODE_MULTIPLIER,
  formatModelDeprecationDate,
  supportsOpenAILongContextPricing,
  type ModelDefinition,
} from "@/lib/constants";
import { translateModelDescription } from "@/lib/model-description-copy";
import { authorLabels } from "./models-author-labels";

export function ModelsGrid({
  grouped,
  modelDescriptionCopy,
  formatNumber,
  providerGuides,
}: {
  grouped: Record<string, ModelDefinition[]>;
  modelDescriptionCopy: Record<string, string>;
  formatNumber: Intl.NumberFormat;
  providerGuides: { provider: string; summary: string }[];
}) {
  const t = useExtracted();
  const locale = useLocale();

  return (
    <section className="relative px-4 pb-16 md:pb-24">
      <div className="mx-auto max-w-4xl space-y-12">
        <div className="rounded-[1.5rem] border border-border/70 bg-card/80 p-6 md:p-8">
          <h2 className="text-xl font-semibold tracking-tight">{t("How to read this page")}</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {t(
              "This page is meant to help visitors understand the role of each model family before they sign up. Instead of only listing brand names, it explains where each provider tends to fit and how to choose a model based on the work you need to do.",
            )}
          </p>
        </div>

        <section className="rounded-[1.5rem] border border-border/70 bg-card p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {t("Model availability changes over time")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {t(
                  "AI providers update model names, capabilities, prices, and rate limits. This page describes the model families currently exposed by Deni AI and the practical role each category plays in the product.",
                )}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          {providerGuides.map((guide) => (
            <div
              key={guide.provider}
              className="rounded-[1.5rem] border border-border/70 bg-card p-5"
            >
              <h2 className="text-lg font-semibold">{guide.provider}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{guide.summary}</p>
            </div>
          ))}
        </div>

        {Object.entries(grouped).map(([author, authorModels]) => (
          <div key={author}>
            <h2 className="text-xl font-semibold tracking-tight mb-4">
              {authorLabels[author] ?? author}
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {authorModels.map((model) => (
                <div key={model.value} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-medium text-sm">{model.name}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                      {model.deprecation && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-700 dark:text-orange-400"
                          title={
                            model.deprecation.tentative
                              ? t("This model is not expected to retire before {date}.", {
                                  date: formatModelDeprecationDate(model.deprecation.date, locale),
                                })
                              : model.deprecation.kind === "retirement"
                                ? t("This model is scheduled to retire on {date}.", {
                                    date: formatModelDeprecationDate(
                                      model.deprecation.date,
                                      locale,
                                    ),
                                  })
                                : t("This model is scheduled to be shut down on {date}.", {
                                    date: formatModelDeprecationDate(
                                      model.deprecation.date,
                                      locale,
                                    ),
                                  })
                          }
                        >
                          <AlertTriangle className="size-3" aria-hidden="true" />
                          {model.deprecation.tentative
                            ? t("Earliest retirement {date}", {
                                date: formatModelDeprecationDate(model.deprecation.date, locale),
                              })
                            : model.deprecation.kind === "retirement"
                              ? t("Retires {date}", {
                                  date: formatModelDeprecationDate(model.deprecation.date, locale),
                                })
                              : t("Shutdown {date}", {
                                  date: formatModelDeprecationDate(model.deprecation.date, locale),
                                })}
                        </span>
                      )}
                      {"tokenMultiplier" in model &&
                        typeof model.tokenMultiplier === "number" &&
                        model.tokenMultiplier > 1 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            title={t("Each token counts {multiplier}× toward your usage", {
                              multiplier: String(model.tokenMultiplier),
                            })}
                          >
                            <Coins className="size-3" aria-hidden="true" />
                            {model.tokenMultiplier}x
                          </span>
                        )}
                      {"premium" in model && model.premium && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          Pro
                        </span>
                      )}
                    </div>
                  </div>
                  {"description" in model && model.description && (
                    <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                      {translateModelDescription(model, modelDescriptionCopy)}
                    </p>
                  )}
                  {"contextWindow" in model && model.contextWindow ? (
                    <p className="mb-3 text-xs text-muted-foreground">
                      {t("Context window")}: {formatNumber.format(model.contextWindow)}
                      {supportsOpenAILongContextPricing(model.value)
                        ? ` · ${t("Long context (>{threshold} input): {multiplier}× usage", {
                            threshold: formatNumber.format(OPENAI_LONG_CONTEXT_INPUT_THRESHOLD),
                            multiplier: String(OPENAI_LONG_CONTEXT_MULTIPLIER),
                          })}`
                        : ""}
                      {"supportsFastMode" in model && model.supportsFastMode
                        ? ` · ${t("Fast mode: {multiplier}× usage", {
                            multiplier: String(OPENAI_FAST_MODE_MULTIPLIER),
                          })}`
                        : ""}
                      {"supportsProMode" in model && model.supportsProMode
                        ? ` · ${t("Pro mode: {multiplier}× premium usage", {
                            multiplier: String(OPENAI_PRO_MODE_MULTIPLIER),
                          })}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
