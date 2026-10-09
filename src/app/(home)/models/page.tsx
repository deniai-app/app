import type { Metadata } from "next";
import Link from "next/link";
import { useExtracted, useLocale } from "next-intl";
import { getExtracted } from "next-intl/server";
import { LoginButton } from "@/components/login-button";
import { models, type ModelDefinition } from "@/lib/constants";
import { useModelDescriptionCopy } from "@/lib/model-description-copy";
import { isModelProviderAvailable } from "@/lib/platform-capabilities";
import { platformCapabilities } from "@/lib/platform-capabilities.server";
import { Button } from "@/components/ui/button";
import { authorLabels } from "./models-author-labels";
import { ModelsGrid } from "./models-grid";
import { publicAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();
  const title = t("GPT, Claude, Gemini and Grok models");
  const description = t(
    "Compare and use GPT, Claude, Gemini, Grok and more in one Deni Chat workspace. Switch models without opening separate apps.",
  );

  return {
    title,
    description,
    alternates: await publicAlternates("/models"),
    openGraph: {
      title: `${title} — Deni AI`,
      description,
    },
  };
}

const numberFormatters: Record<string, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en"),
  ja: new Intl.NumberFormat("ja"),
};

export default function ModelsPage() {
  const t = useExtracted();
  const modelDescriptionCopy = useModelDescriptionCopy();
  const locale = useLocale();
  const formatNumber = numberFormatters[locale] ?? numberFormatters.en;
  const availableModels = models.filter((model) =>
    isModelProviderAvailable(platformCapabilities, model.provider ?? model.author),
  );

  const grouped = availableModels.reduce(
    (acc, model) => {
      const author = model.author;
      if (!acc[author]) acc[author] = [];
      acc[author].push(model);
      return acc;
    },
    {} as Record<string, ModelDefinition[]>,
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "AI Models available on Deni AI",
    numberOfItems: availableModels.length,
    itemListElement: availableModels.map((model, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: model.name,
    })),
  };

  const providerGuideSummaries: Partial<Record<keyof typeof authorLabels, string>> = {
    openai: t(
      "A broad mix of general-purpose, reasoning, and coding models. Useful when you want the widest range of task coverage in one family.",
    ),
    anthropic: t(
      "Often a strong choice for structured writing, analysis, and long-form reasoning where tone and coherence matter.",
    ),
    google: t(
      "Useful when you want another high-capability option for multimodal and general productivity workflows inside the same workspace.",
    ),
    xai: t(
      "Helpful to compare against other providers when you want a different response style or model behavior for the same prompt.",
    ),
  };

  const providerGuides = Object.keys(grouped).flatMap((providerKey) => {
    const summary = providerGuideSummaries[providerKey as keyof typeof providerGuideSummaries];
    if (!summary) {
      return [];
    }

    return [
      {
        provider: authorLabels[providerKey] ?? providerKey,
        summary,
      },
    ];
  });

  const selectionGuide = [
    {
      title: t("Start with the task, not the brand"),
      description: t(
        "Choose based on the job you need done: quick drafting, careful reasoning, coding, or side-by-side comparison.",
      ),
    },
    {
      title: t("Use faster models for iteration"),
      description: t(
        "When the work is exploratory, speed matters. Fast models help you refine prompts before moving to more expensive reasoning models.",
      ),
    },
    {
      title: t("Escalate to stronger reasoning when the stakes increase"),
      description: t(
        "Planning, debugging, evaluations, and nuanced tradeoffs usually benefit from a model with stronger reasoning behavior.",
      ),
    },
    {
      title: t("Compare outputs before you trust them"),
      description: t(
        "No model is correct all the time. Deni AI is most valuable when you can inspect multiple answers without changing products.",
      ),
    },
  ];

  const taskGuide = [
    {
      task: t("Quick answers and short drafts"),
      modelType: t("Fast general models"),
      note: t(
        "Use these when speed matters more than deep reasoning, such as brainstorming, rewriting a sentence, or getting a first explanation.",
      ),
    },
    {
      task: t("Planning and analysis"),
      modelType: t("Reasoning-focused models"),
      note: t(
        "Use these for tradeoffs, debugging plans, product decisions, and tasks where you want the model to show more careful structure.",
      ),
    },
    {
      task: t("Implementation and refactoring"),
      modelType: t("Coding-capable models"),
      note: t(
        "Use these when the output needs to fit real code, follow constraints, explain errors, or produce a change plan.",
      ),
    },
    {
      task: t("Translation and tone review"),
      modelType: t("Strong writing models"),
      note: t(
        "Use these when wording, nuance, and readability matter more than raw speed or tool use.",
      ),
    },
  ];

  return (
    <main className="relative min-h-screen" id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <section className="relative px-4 pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1] mb-5">
            {t("AI Models")}
          </h1>
          <p className="max-w-xl mx-auto text-base md:text-lg text-muted-foreground leading-relaxed mb-8">
            {t(
              "All the top AI models from leading providers, available in one place. No separate subscriptions needed.",
            )}
          </p>
        </div>
      </section>

      <ModelsGrid
        grouped={grouped}
        modelDescriptionCopy={modelDescriptionCopy}
        formatNumber={formatNumber}
        providerGuides={providerGuides}
      />

      <section className="relative px-4 pb-16 md:pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {t("Choose by task type")}
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {t(
                "The same model is rarely best for every job. A practical workflow is to decide what kind of output you need, pick the smallest reliable option, then compare another model when the answer affects real work.",
              )}
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-[1.5rem] border border-border/70 bg-card">
            <div className="grid grid-cols-1 border-b border-border/70 bg-secondary/40 px-5 py-3 text-sm font-semibold md:grid-cols-[1fr_1fr_1.4fr]">
              <div>{t("Task")}</div>
              <div>{t("Good starting point")}</div>
              <div>{t("What to watch")}</div>
            </div>
            {taskGuide.map((item) => (
              <article
                key={item.task}
                className="grid gap-3 border-b border-border/70 px-5 py-5 text-sm last:border-b-0 md:grid-cols-[1fr_1fr_1.4fr]"
              >
                <h3 className="font-semibold">{item.task}</h3>
                <p className="text-muted-foreground">{item.modelType}</p>
                <p className="leading-7 text-muted-foreground">{item.note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-y border-border/50 bg-secondary/20 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {t("A practical guide to choosing the right model")}
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {t(
                "People often compare providers by hype alone. In practice, a better rule is to start with what the task demands, then move to the smallest model that produces a trustworthy result. That is the operating idea behind Deni AI.",
              )}
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {selectionGuide.map((item) => (
              <div
                key={item.title}
                className="rounded-[1.5rem] border border-border/70 bg-card p-6"
              >
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="outline" render={<Link href="/use-cases" />} nativeButton={false}>
              {t("See example use cases")}
            </Button>
          </div>
        </div>
      </section>

      <section className="relative px-4 py-16 md:py-24">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl border border-border bg-card p-8 md:p-10 text-center">
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-3">
              {t("Try All Models for Free")}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm">
              {t("Start chatting with the latest AI models today. No credit card required.")}
            </p>
            <LoginButton />
          </div>
        </div>
      </section>
    </main>
  );
}
