import type { Metadata } from "next";
import Link from "next/link";
import {
  BrainCircuit,
  ClipboardCheck,
  Code2,
  FileText,
  Globe,
  Lock,
  MessagesSquare,
  Users,
  Zap,
} from "lucide-react";
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { LoginButton } from "@/components/login-button";
import { publicAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();
  const title = t("About");
  const description = t(
    "What Deni AI (Deni Chat) is, why the multi-model chat workspace exists, and how the product is designed.",
  );

  return {
    title,
    description,
    alternates: await publicAlternates("/about"),
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

function ValueCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl border border-border bg-card">
      <div className="inline-flex items-center justify-center size-10 rounded-xl bg-secondary text-foreground mb-4">
        <Icon className="size-5" />
      </div>
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}

export default function AboutPage() {
  const t = useExtracted();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Deni AI",
    url: "https://deniai.app",
    description: "A free, fast, and private multi-model AI chat platform.",
  };
  const designPrinciples = [
    {
      title: t("Model choice should be practical"),
      description: t(
        "The interface is organized around real tasks instead of model hype. Visitors can read when to use fast models, reasoning models, coding models, and provider comparisons.",
      ),
    },
    {
      title: t("AI output should stay reviewable"),
      description: t(
        "Deni AI encourages users to treat answers as drafts. Important facts, code, calculations, and recommendations should be checked before they are used.",
      ),
    },
    {
      title: t("The product should explain itself publicly"),
      description: t(
        "Public pages describe use cases, supported model families, privacy expectations, legal terms, and migration guidance before a visitor creates an account.",
      ),
    },
  ];

  const audienceGroups = [
    {
      icon: MessagesSquare,
      title: t("Everyday AI users"),
      description: t(
        "People who want help writing, summarizing, translating, planning, and learning without comparing separate provider dashboards.",
      ),
    },
    {
      icon: Code2,
      title: t("Developers and builders"),
      description: t(
        "People who switch between explanation, architecture, debugging, and implementation work and want coding-focused models nearby.",
      ),
    },
    {
      icon: Users,
      title: t("Small teams"),
      description: t(
        "Teams that need shared access, usage visibility, provider flexibility, and a consistent place to discuss AI-assisted work.",
      ),
    },
  ];

  return (
    <main className="relative min-h-screen" id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* Hero */}
      <section className="relative px-4 pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1] mb-5">
            {t("About Deni AI")}
          </h1>
          <p className="max-w-xl mx-auto text-base md:text-lg text-muted-foreground leading-relaxed">
            {t(
              "We believe everyone deserves access to the best AI technology. Deni AI brings all the leading AI models together in one simple, free platform.",
            )}
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="relative px-4 pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-border bg-card p-8 md:p-10">
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-4">
              {t("Our Mission")}
            </h2>
            <div className="space-y-4 text-muted-foreground text-sm leading-relaxed">
              <p>
                {t(
                  "AI is transforming the way we work, learn, and create. But access to the latest models is fragmented across multiple platforms, each with its own subscription and interface.",
                )}
              </p>
              <p>
                {t(
                  "Deni AI solves this by providing a unified interface to all the top AI models — GPT, Claude, Gemini, Grok, and more — so you can choose the right model for every task without juggling multiple subscriptions.",
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-y border-border/50 bg-secondary/20 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-secondary">
              <ClipboardCheck className="size-5" />
            </div>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {t("How we decide what belongs in Deni AI")}
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {t(
                "A multi-model product can become confusing if it only adds more choices. Our design goal is to make those choices easier to understand: start simple, compare when needed, and keep the user in control of the final answer.",
              )}
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {designPrinciples.map((principle) => (
              <article
                key={principle.title}
                className="rounded-[1.5rem] border border-border/70 bg-card p-6"
              >
                <h3 className="text-lg font-semibold">{principle.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {principle.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {t("Who Deni AI is built for")}
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {t(
                "Deni AI is most useful for people who already know AI can help, but want a calmer way to choose the right model and keep their work organized.",
              )}
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {audienceGroups.map((group) => (
              <article
                key={group.title}
                className="rounded-[1.5rem] border border-border bg-card p-6"
              >
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-2xl bg-secondary">
                  <group.icon className="size-5" />
                </div>
                <h3 className="text-lg font-semibold">{group.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{group.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="relative px-4 pb-16 md:pb-24">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
              {t("What We Stand For")}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <ValueCard
              icon={Globe}
              title={t("Accessible")}
              description={t(
                "Free to use with generous limits. Premium AI should not be locked behind expensive paywalls.",
              )}
            />
            <ValueCard
              icon={Zap}
              title={t("Fast")}
              description={t(
                "Optimized infrastructure delivers instant responses. No waiting, just results.",
              )}
            />
            <ValueCard
              icon={Lock}
              title={t("PrivateTitle")}
              description={t(
                "Your conversations stay yours. We do not use your data to train models.",
              )}
            />
            <ValueCard
              icon={BrainCircuit}
              title={t("Multi-Model")}
              description={t(
                "Access the latest models from OpenAI, Anthropic, Google, xAI, and more from one interface.",
              )}
            />
            <ValueCard
              icon={Code2}
              title={t("Developer-Friendly")}
              description={t(
                "Built by developers, for everyone. Use leading AI model families from one practical interface.",
              )}
            />
            <ValueCard
              icon={Users}
              title={t("Team Ready")}
              description={t(
                "Collaborate with your team. Share usage and manage access from a single dashboard.",
              )}
            />
          </div>
        </div>
      </section>

      <section className="relative border-y border-border/50 bg-background/80 px-4 py-16 md:py-24">
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
          <article className="rounded-[1.5rem] border border-border/70 bg-card p-6">
            <FileText className="size-5 text-primary" />
            <h2 className="mt-5 text-xl font-semibold tracking-tight">
              {t("Public information before account creation")}
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {t(
                "The public site includes product pages, use cases, model information, terms, privacy policy, and commercial disclosure so visitors can understand the service before signing in.",
              )}
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-border/70 bg-card p-6">
            <Lock className="size-5 text-primary" />
            <h2 className="mt-5 text-xl font-semibold tracking-tight">
              {t("Data handling expectations")}
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {t(
                "The privacy policy explains what account, usage, billing, and submitted content data may be processed to operate the service, secure accounts, and prevent abuse.",
              )}
            </p>
          </article>
        </div>
      </section>

      <section className="relative px-4 pb-8 md:pb-12">
        <div className="mx-auto max-w-3xl space-y-4 text-sm leading-8 text-muted-foreground">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("Public resources we maintain")}
          </h2>
          <p>
            {t(
              "Beyond the chat product, Deni AI publishes a dated blog and original guides on model selection, answer verification, multi-model workflows, study practice, prompt patterns, and privacy habits. These pages are written for visitors who want useful methods, not only a signup funnel.",
            )}
          </p>
          <p>
            {t(
              "We also maintain FAQ, contact, terms, privacy, and commercial disclosure pages so people can understand the service, reach a human, and review policies before creating an account.",
            )}
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="relative px-4 py-16 md:py-24">
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-col items-center rounded-xl border border-border bg-card p-8 md:p-10 text-center">
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-3">
              {t("Ready to Get Started?")}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm">
              {t(
                "Join thousands of users who are already experiencing the future of AI assistance.",
              )}
            </p>
            <LoginButton />
            <p className="mt-6 text-sm text-muted-foreground">
              {t("Questions first?")}{" "}
              <Link
                href="/contact"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("Contact us")}
              </Link>
              {" · "}
              <Link
                href="/faq"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("FAQ")}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
