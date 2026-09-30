"use client";

import React from "react";
import { m } from "motion/react";
import Link from "next/link";
import { ArrowRight, BookOpenText, BrainCircuit, Code, PencilLine, Zap } from "lucide-react";
import { useExtracted } from "next-intl";
import { Button } from "@/components/ui/button";

function FeatureCard({
  icon: Icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="group relative p-6 rounded-2xl border border-border bg-card/20 backdrop-blur-sm transition-[translate,box-shadow,background-color] hover:bg-card hover:shadow-xl hover:-translate-y-1"
    >
      <div className="inline-flex items-center justify-center size-12 rounded-xl bg-secondary text-foreground mb-4 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-[background-color,scale,color] duration-300">
        <Icon className="size-6" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </m.div>
  );
}

export function HomeFeaturesSection() {
  const t = useExtracted();

  const quickUses = [
    {
      icon: BrainCircuit,
      title: t("Ask and compare"),
      description: t(
        "Try the same question with different models when you want a clearer answer or a second opinion.",
      ),
    },
    {
      icon: PencilLine,
      title: t("Write a little faster"),
      description: t(
        "Draft messages, notes, captions, and small pieces of writing without getting stuck on the first version.",
      ),
    },
    {
      icon: BookOpenText,
      title: t("Study or explore"),
      description: t(
        "Break down topics, summarize what you are reading, and keep learning moving when you want help thinking something through.",
      ),
    },
  ];

  const modelTips = [
    {
      icon: Zap,
      title: t("Start with something fast"),
      description: t("If you just want a quick answer or rough draft, that is usually enough."),
    },
    {
      icon: BrainCircuit,
      title: t("Switch when you want more depth"),
      description: t(
        "If the first answer feels thin, move to a stronger model for better reasoning or explanation.",
      ),
    },
    {
      icon: Code,
      title: t("Use coding models for code"),
      description: t(
        "When the task is implementation, debugging, or refactoring, pick a model made for that kind of work.",
      ),
    },
  ];

  const workflowSteps = [
    {
      title: t("Start with a clear task"),
      description: t(
        "Write what you want to decide, create, summarize, translate, or debug. A specific prompt gives every model a fair starting point.",
      ),
    },
    {
      title: t("Compare when accuracy matters"),
      description: t(
        "For important answers, run a second model and look for agreement, missing details, or different assumptions before you rely on the result.",
      ),
    },
    {
      title: t("Keep the human review step"),
      description: t(
        "Deni AI is designed to speed up thinking and drafting, not to replace judgment. Review facts, code, numbers, and recommendations before using them.",
      ),
    },
  ];

  return (
    <>
      <section id="features" className="relative px-4 py-24 md:py-32 bg-secondary/20 backdrop-blur">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-20">
            <m.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-6 text-4xl font-semibold tracking-tight md:text-5xl"
            >
              {t("A few things you can do with Deni AI")}
            </m.h2>
            <m.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-muted-foreground text-xl max-w-2xl mx-auto"
            >
              {t(
                "Pick the model that fits the moment, whether you want a quick answer, help writing, or a second opinion while you work.",
              )}
            </m.p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {quickUses.map((item, index) => (
              <FeatureCard
                key={item.title}
                icon={item.icon}
                title={item.title}
                description={item.description}
                delay={0.3 + index * 0.1}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-4 py-24 md:py-32">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              {t("Picking a model")}
            </p>
            <h2 className="text-4xl font-semibold tracking-tight">
              {t("You can keep this part simple")}
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              {t(
                "You do not need to memorize every model name. Start with something quick, then switch when you want a better answer, more reasoning, or help with code.",
              )}
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {modelTips.map((tip) => (
              <div
                key={tip.title}
                className="rounded-[1.5rem] border border-border/70 bg-card/90 p-6 shadow-sm"
              >
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-2xl bg-secondary text-sm font-semibold">
                  <tip.icon />
                </div>
                <h3 className="text-lg font-semibold">{tip.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{tip.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-y border-border/40 bg-background/85 px-4 py-24 md:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                {t("Practical workflow")}
              </p>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {t("Use AI as a working draft, then verify what matters")}
              </h2>
              <p className="mt-5 text-sm leading-7 text-muted-foreground">
                {t(
                  "Deni AI is useful because it keeps model switching close to the task. You can start with a quick answer, compare a second model when the answer matters, and keep your final decision separate from the AI draft.",
                )}
              </p>
            </div>

            <div className="grid gap-4">
              {workflowSteps.map((step, index) => (
                <article
                  key={step.title}
                  className="rounded-[1.5rem] border border-border/70 bg-card p-6"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold">{step.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-y border-border/40 bg-background/80 px-4 py-24 md:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              {t("Start wherever feels easy")}
            </p>
            <h2 className="text-4xl font-semibold tracking-tight">
              {t("You do not need a big setup")}
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              {t(
                "If you just want to look around first, these are the two easiest places to start.",
              )}
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Link
              href="/models"
              className="rounded-[1.5rem] border border-border/70 bg-card p-6 transition-transform hover:-translate-y-1"
            >
              <Zap className="size-5 text-primary" />
              <h3 className="mt-5 text-xl font-semibold">{t("See the models")}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {t(
                  "Take a quick look at what is available and pick one that feels right for the moment.",
                )}
              </p>
            </Link>
            <Link
              href="/use-cases"
              className="rounded-[1.5rem] border border-border/70 bg-card p-6 transition-transform hover:-translate-y-1"
            >
              <BookOpenText className="size-5 text-primary" />
              <h3 className="mt-5 text-xl font-semibold">{t("See how people use it")}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {t(
                  "Get a feel for the small everyday ways Deni AI can help with writing, studying, and thinking things through.",
                )}
              </p>
            </Link>
          </div>

          <div className="mt-10 flex justify-start">
            <Button variant="outline" render={<Link href="/models" />} nativeButton={false}>
              {t("Open the model list")}
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" render={<Link href="/guides" />} nativeButton={false}>
              {t("Read the AI guides")}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
