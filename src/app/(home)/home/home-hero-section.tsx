"use client";

import React, { type ReactNode } from "react";
import dynamic from "next/dynamic";
import { m } from "motion/react";
import Link from "next/link";
import { useExtracted, useLocale } from "next-intl";
import { localizedPath } from "@/lib/locale-path";
import SiAnthropic from "@icons-pack/react-simple-icons/icons/SiAnthropic";
import SiGoogle from "@icons-pack/react-simple-icons/icons/SiGoogle";
import SiX from "@icons-pack/react-simple-icons/icons/SiX";
import { LoginButton } from "@/components/login-button";
import { BlurReveal } from "@/components/blur-reveal";
import { HighlightedText } from "@/components/highlighted-text";
import { LogosCarousel } from "@/components/logos-carousel";
import Openai from "@/components/openai";
import { AdSlot } from "@/components/ad-slot";
import { authClient } from "@/lib/auth-client";

// WebGL gradient is heavy — load after hydration for faster first paint
const AnimatedGradient = dynamic(() => import("@/components/animated-gradient"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-background" aria-hidden />,
});

export function HomeHeroSection({ featuredBadge }: { featuredBadge?: ReactNode }) {
  const t = useExtracted();
  const locale = useLocale();
  const session = authClient.useSession();
  const hrefFor = (path: string) => localizedPath(path, locale);

  const aiLogos = [
    <Openai key="openai" className="size-8 opacity-40 hover:opacity-100 transition-opacity" />,
    <SiGoogle key="google" className="size-8 opacity-40 hover:opacity-100 transition-opacity" />,
    <SiAnthropic
      key="anthropic"
      className="size-8 opacity-40 hover:opacity-100 transition-opacity"
    />,
    <Openai key="openai2" className="size-8 opacity-40 hover:opacity-100 transition-opacity" />,
    <SiX key="xai" className="size-8 opacity-40 hover:opacity-100 transition-opacity" />,
    <SiGoogle key="google2" className="size-8 opacity-40 hover:opacity-100 transition-opacity" />,
  ];

  return (
    <>
      <AnimatedGradient
        config={{ preset: "Plasma", speed: 15 }}
        noise={{ opacity: 0.05 }}
        className="opacity-40"
      />

      <section className="min-h-[100vh] relative px-4 pt-32 pb-20 md:pt-48 md:pb-32">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center text-center">
            {featuredBadge}
            <h1 className="mb-8 text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl md:text-8xl">
              <BlurReveal className="block" delay={0.2}>
                {t("The AI Assistant")}
              </BlurReveal>
              <m.span
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.8 }}
                className="block mt-4"
              >
                <HighlightedText from="left" delay={1.2} className="px-4 py-1">
                  {t("You Deserve")}
                </HighlightedText>
              </m.span>
            </h1>

            <m.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.8 }}
              className="max-w-2xl text-xl md:text-2xl text-muted-foreground leading-relaxed mb-12 font-medium"
            >
              {t(
                "Open Deni Chat in your browser. Deni AI gives you GPT, Claude, Gemini and more in one free workspace.",
              )}
            </m.p>

            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6, duration: 0.8 }}
              className="flex flex-col items-center gap-5"
            >
              <LoginButton />
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
                <Link href={hrefFor("/models")} className="transition-colors hover:text-foreground">
                  {t("Browse models")}
                </Link>
                <span aria-hidden="true">/</span>
                <Link
                  href={hrefFor("/use-cases")}
                  className="transition-colors hover:text-foreground"
                >
                  {t("See use cases")}
                </Link>
                <span aria-hidden="true">/</span>
                <Link href={hrefFor("/guides")} className="transition-colors hover:text-foreground">
                  {t("Read AI guides")}
                </Link>
                <span aria-hidden="true">/</span>
                <Link
                  href={hrefFor("/desktop")}
                  className="transition-colors hover:text-foreground"
                >
                  {t("Download desktop app")}
                </Link>
              </div>
            </m.div>

            {!session.isPending && (
              <AdSlot
                viewerId={session.data?.user.id ?? "public"}
                chatId="home"
                placement="home"
                visible
                requestInFlight={false}
                className="mt-10 max-w-xl text-left"
              />
            )}

            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2, duration: 1 }}
              className="flex flex-col items-center mt-24 w-full"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground/50 mb-10">
                {t("Powered by the world's best models")}
              </p>

              <LogosCarousel count={3} interval={3000} className="w-full items-center">
                {aiLogos.map((logo, i) => (
                  <React.Fragment key={i}>{logo}</React.Fragment>
                ))}
              </LogosCarousel>
            </m.div>
          </div>
        </div>
      </section>
    </>
  );
}
