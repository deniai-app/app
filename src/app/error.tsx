"use client";

import * as Sentry from "@sentry/nextjs";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { isStaleDeploymentError, reloadForStaleDeployment } from "@/lib/stale-deployment";
import { versions } from "@/lib/version";

type ErrorPageProps = {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the boundary's children. Preferred over `reset` since Next 16.3. */
  retry: () => void;
};

/**
 * Keep this boundary free of next-intl / useExtracted.
 * Error boundaries load outside the normal chunk graph; depending on i18n
 * modules can fail with "module factory is not available" under Turbopack.
 */
const COPY = {
  en: {
    title: "Something went wrong",
    description: "An unexpected error occurred. You can retry or return to the home page.",
    tryAgain: "Try again",
    backHome: "Back to home",
    report: "Error report",
    includeReport: "Include this report when contacting support.",
  },
  ja: {
    title: "問題が発生しました",
    description: "予期しないエラーが発生しました。再試行するか、ホームに戻ってください。",
    tryAgain: "再試行",
    backHome: "ホームに戻る",
    report: "エラーレポート",
    includeReport: "サポートへ連絡する際は、このレポートを添付してください。",
  },
} as const;

/** The locale cannot change while this boundary is mounted, so never notify. */
function subscribeNever() {
  return () => {};
}

function getLocaleSnapshot(): keyof typeof COPY {
  const lang = document.documentElement.lang || navigator.language || "en";
  return lang.toLowerCase().startsWith("ja") ? "ja" : "en";
}

function getServerLocaleSnapshot(): keyof typeof COPY {
  return "en";
}

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  const pathname = usePathname();
  // Read during render rather than in an effect: setState-in-effect costs an extra
  // render pass and flashes English first. html[lang] is already set by the root
  // layout's pre-hydration script, so the client snapshot is correct immediately.
  const locale = useSyncExternalStore(subscribeNever, getLocaleSnapshot, getServerLocaleSnapshot);
  const [timestamp] = useState(() => new Date().toISOString());
  const t = COPY[locale];

  useEffect(() => {
    // A tab left open across a redeploy cannot load the new chunks; reload instead of reporting.
    if (isStaleDeploymentError(error) && reloadForStaleDeployment()) {
      return;
    }
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  // No useMemo: the React Compiler memoizes this automatically.
  const reportItems = [
    { label: "Version", value: versions.version },
    { label: "Version Hash", value: versions.hash },
    { label: "Path", value: pathname ?? "Unknown" },
    { label: "Time", value: timestamp },
    { label: "Digest", value: error.digest ?? "n/a" },
    { label: "Name", value: error.name ?? "Error" },
    { label: "Message", value: error.message || "Unexpected error" },
  ];

  const reportText = reportItems.map((item) => `${item.label}: ${item.value}`).join("\n");

  return (
    <main
      className="min-h-screen bg-gradient-to-b from-background via-background to-destructive/10"
      id="main-content"
    >
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <TriangleAlert className="size-12 text-destructive" aria-hidden="true" />
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {t.title}
          </h1>
          <p className="max-w-xl text-muted-foreground">{t.description}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={retry}>{t.tryAgain}</Button>
            <Button variant="secondary" render={<Link href="/" />} nativeButton={false}>
              {t.backHome}
            </Button>
          </div>
        </div>
        <section className="w-full max-w-2xl rounded-xl border border-border/60 bg-card/70 p-6 text-left shadow-sm">
          <div className="text-xs font-semibold text-muted-foreground">{t.report}</div>
          <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-4 font-mono text-xs text-foreground">
            {reportText}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">{t.includeReport}</p>
        </section>
      </div>
    </main>
  );
}
