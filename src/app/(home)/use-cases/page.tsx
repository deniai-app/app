import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Code2,
  Languages,
  Lightbulb,
  MessagesSquare,
} from "lucide-react";
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { LoginButton } from "@/components/login-button";
import { Button } from "@/components/ui/button";
import { publicAlternates } from "@/lib/seo";

type UseCaseCardProps = {
  icon: React.ElementType;
  title: string;
  summary: string;
  details: string;
};

function UseCaseCard({ icon: Icon, title, summary, details }: UseCaseCardProps) {
  return (
    <article className="rounded-[1.5rem] border border-border/70 bg-card p-6">
      <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-secondary">
        <Icon className="size-5" />
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 text-sm font-medium text-foreground/85">{summary}</p>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{details}</p>
    </article>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();
  const title = t("Use Cases");
  const description = t(
    "Practical examples of how Deni AI helps with research, writing, coding, and multilingual work across multiple model providers.",
  );

  return {
    title,
    description,
    alternates: await publicAlternates("/use-cases"),
    openGraph: {
      title: `${title} — Deni AI`,
      description,
    },
    twitter: {
      title: `${title} | Deni AI`,
      description,
    },
  };
}

export default function UseCasesPage() {
  const t = useExtracted();
  const headline = t("Practical ways people can use Deni AI");
  const description = t(
    "This page exists to explain the product in concrete terms. Deni AI is not just a generic chat interface. It is a workspace for people who need to move between AI models during research, writing, coding, and multilingual work without juggling separate services.",
  );
  const canonicalUrl = new URL("/use-cases", "https://deniai.app").toString();

  const cards = [
    {
      id: "research",
      icon: BookOpenText,
      title: t("Research and briefing"),
      summary: t("Turn raw information into structured notes and clear next actions."),
      details: t(
        "Deni AI is useful when you need to summarize notes, compare explanations, or reduce a large topic into a short working brief. A faster model can help shape the first draft, while a stronger reasoning model can test assumptions or identify gaps.",
      ),
    },
    {
      id: "writing",
      icon: MessagesSquare,
      title: t("Writing and editing"),
      summary: t("Draft faster without losing control of tone or structure."),
      details: t(
        "Use the app to rewrite copy, improve clarity, tailor tone, and create variants for emails, product copy, internal docs, or support responses. The value is not only speed but also the ability to compare different model styles in one interface.",
      ),
    },
    {
      id: "coding",
      icon: Code2,
      title: t("Coding workflows"),
      summary: t("Move from idea to implementation with model switching built in."),
      details: t(
        "Developers can use Deni AI to explain stack traces, break down implementation tasks, refactor code, or compare code suggestions across providers. Coding-oriented models tend to do better on implementation details, while reasoning models are useful for architecture and tradeoffs.",
      ),
    },
    {
      id: "multilingual",
      icon: Languages,
      title: t("Multilingual work"),
      summary: t("Translate, localize, and refine wording for real audiences."),
      details: t(
        "For teams working across languages, Deni AI helps with translation, wording review, localization drafts, and consistency checks. This is especially useful when a literal translation is not enough and the final text still needs to read naturally.",
      ),
    },
  ];

  const principles = [
    {
      id: "smallest-trustworthy",
      text: t("Use the smallest model that produces a trustworthy result."),
    },
    {
      id: "escalate-for-complexity",
      text: t("Escalate to stronger reasoning only when the task complexity justifies it."),
    },
    {
      id: "compare-risky-decisions",
      text: t("Compare more than one answer on decisions that carry product or customer risk."),
    },
    {
      id: "human-review",
      text: t("Treat AI output as draft material that still benefits from human review."),
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    author: {
      "@type": "Organization",
      name: "Deni AI",
    },
    publisher: {
      "@type": "Organization",
      name: "Deni AI",
    },
    mainEntityOfPage: canonicalUrl,
  };

  return (
    <main className="relative min-h-screen" id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <section className="relative px-4 pb-16 pt-32 md:pb-20 md:pt-40">
        <div className="mx-auto max-w-4xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            {t("Use Cases")}
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            {headline}
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-muted-foreground">{description}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="outline" render={<Link href="/models" />} nativeButton={false}>
              {t("Compare models")}
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" render={<Link href="/about" />} nativeButton={false}>
              {t("Learn about the product")}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      <section className="relative px-4 pb-16 md:pb-24">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <UseCaseCard key={card.id} {...card} />
          ))}
        </div>
      </section>

      <section className="relative border-y border-border/50 bg-secondary/20 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[1.5rem] border border-border/70 bg-card p-6 md:p-8">
            <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-secondary">
              <Lightbulb className="size-5" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">
              {t("How to get useful output from multi-model AI")}
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {t(
                "The real advantage of a multi-model workspace is not novelty. It is being able to route different types of work to different strengths. In practice, that means starting with a quick pass, escalating when the task is hard, and validating important answers instead of trusting the first response by default.",
              )}
            </p>

            <ul className="mt-6 space-y-3 text-sm leading-7 text-muted-foreground">
              {principles.map((principle) => (
                <li key={principle.id} className="flex gap-3">
                  <span className="mt-2 size-2 rounded-full bg-primary" aria-hidden="true" />
                  <span>{principle.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="relative px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl space-y-6 text-sm leading-8 text-muted-foreground">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("What a good first week with Deni AI looks like")}
          </h2>
          <p>
            {t(
              "Day one: pick one low-risk recurring task such as rewriting notes or summarizing an article you already understand. Learn the model switcher without high stakes.",
            )}
          </p>
          <p>
            {t(
              "Day two to three: try a second-opinion pass on something more important, such as a plan or support draft. Keep the first answer, ask another model to critique assumptions, and verify the disputed points yourself.",
            )}
          </p>
          <p>
            {t(
              "End of week: write down which model roles worked for your work. Fast drafter, careful reviewer, coding helper, and translator are enough labels for most people. The habit matters more than chasing every new release.",
            )}
          </p>
          <p>
            {t(
              "If you want deeper methods, read the public AI Guides on model selection, verification, prompt patterns, and multi-model workflows. Those pages are written as standalone educational resources.",
            )}
          </p>
        </div>
      </section>

      <section className="relative px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl rounded-[1.75rem] border border-border/70 bg-card p-8 text-center md:p-10">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("Want to try these workflows yourself?")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            {t(
              "You can start with the public product information, review the model list, and then open the app once you know which workflow you want to test.",
            )}
          </p>
          <div className="mt-6 flex flex-col items-center gap-4">
            <LoginButton />
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline" render={<Link href="/blog" />} nativeButton={false}>
                {t("Blog")}
                <ArrowRight className="size-4" />
              </Button>
              <Button variant="outline" render={<Link href="/guides" />} nativeButton={false}>
                {t("AI Guides")}
                <ArrowRight className="size-4" />
              </Button>
              <Button variant="outline" render={<Link href="/faq" />} nativeButton={false}>
                {t("FAQ")}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
