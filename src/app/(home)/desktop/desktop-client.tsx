"use client";

import { LazyMotion, domAnimation, m } from "motion/react";
import { AppWindowMac, ArrowRight, BellRing, Download, Feather, Workflow } from "lucide-react";
import Link from "next/link";
import { useExtracted } from "next-intl";
import { BlurReveal } from "@/components/blur-reveal";
import { HighlightedText } from "@/components/highlighted-text";
import { Button } from "@/components/ui/button";
import { DesktopDownloadPicker } from "./desktop-download-picker";
import { DesktopFeaturesSection } from "./desktop-features-section";
import type { DesktopDownloads } from "./types";

export function DesktopClient({ downloads }: { downloads: DesktopDownloads }) {
  const t = useExtracted();

  return (
    <LazyMotion features={domAnimation} strict>
      <main className="relative min-h-screen overflow-hidden" id="main-content">
        <section className="relative min-h-[100vh] px-4 pb-20 pt-32 md:pb-32 md:pt-48">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col items-center text-center">
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="mb-6 inline-flex items-center gap-2 rounded-md border border-border bg-secondary/70 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur"
              >
                <AppWindowMac className="size-3.5" />
                {t("Desktop Companion")}
              </m.div>

              <h1
                data-nosnippet
                className="mb-8 text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl md:text-8xl"
              >
                <BlurReveal className="block" delay={0.2}>
                  {t("Deni AI Desktop")}
                </BlurReveal>
                <m.span
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.8 }}
                  className="mt-4 block"
                >
                  <HighlightedText from="left" delay={1.1} className="px-4 py-1">
                    {t("one click away")}
                  </HighlightedText>
                </m.span>
              </h1>

              <m.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3, duration: 0.8 }}
                className="mb-12 max-w-2xl text-xl font-medium leading-relaxed text-muted-foreground md:text-2xl"
              >
                {t(
                  "The official Deni Chat desktop app for Windows and macOS: tray access, notifications, and everyday AI use without living in a browser tab.",
                )}
              </m.p>

              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 0.8 }}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <Button
                  variant="outline"
                  size="lg"

                  className="group transition-colors hover:bg-secondary"
                  render={<Link href="#download" />}
                  nativeButton={false}
                >
                  <Download className="size-5 transition-transform group-hover:translate-x-1" />
                  {t("Download")}
                </Button>
                <Button
                  variant="outline"
                  size="lg"

                  className="group transition-colors hover:bg-secondary"
                  render={<Link href="#features" />}
                  nativeButton={false}
                >
                  {t("Learn More")}
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </m.div>

              <m.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.8, duration: 0.8 }}
                className="mt-20 w-full max-w-4xl"
              >
                <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-5">
                  <div className="mb-5 flex items-center justify-between gap-4 border-b border-border/70 pb-4">
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full bg-rose-400" />
                      <span className="size-3 rounded-full bg-amber-400" />
                      <span className="size-3 rounded-full bg-emerald-400" />
                    </div>
                    <div className="rounded-full border border-border bg-secondary/70 px-3 py-1 text-xs text-muted-foreground">
                      {t("Running in tray")}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-2xl border border-border bg-card p-5 text-left">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <Workflow className="size-4 text-muted-foreground" />
                        {t("Tray")}
                      </div>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {t(
                          "Keep Deni AI running in your tray so you can open, hide, and return instantly without managing browser tabs.",
                        )}
                      </p>
                      <div className="mt-5 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
                        {t("Quick access from the background, whenever you need it.")}
                      </div>
                    </div>

                    <div className="grid gap-4 text-left">
                      <div className="rounded-2xl border border-border bg-card p-5">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                          <BellRing className="size-4 text-muted-foreground" />
                          {t("Native notifications")}
                        </div>
                        <p className="text-sm leading-7 text-muted-foreground">
                          {t(
                            "Get desktop notifications for replies and important activity so you can respond at the right moment.",
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-border bg-card p-5">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                          <Feather className="size-4 text-muted-foreground" />
                          {t("Lightweight")}
                        </div>
                        <p className="text-sm leading-7 text-muted-foreground">
                          {t(
                            "Designed to stay fast and unobtrusive, with a compact footprint that feels natural to keep open.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </m.div>
            </div>
          </div>
        </section>

        <DesktopFeaturesSection />
        <DesktopDownloadPicker downloads={downloads} />
      </main>
    </LazyMotion>
  );
}
