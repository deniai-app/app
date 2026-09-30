import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useExtracted, useLocale } from "next-intl";
import { getExtracted } from "next-intl/server";
import { changelogEntries } from "@/lib/changelog";
import { formatAppDate } from "@/lib/format-date";
import { LoginButton } from "@/components/login-button";
import { publicAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();
  const title = t("Changelog");
  const description = t(
    "Release notes for Deni AI: new models, team tools, billing, and chat workspace updates.",
  );

  return {
    title,
    description,
    alternates: await publicAlternates("/changelog"),
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

export default function ChangelogPage() {
  const t = useExtracted();
  const locale = useLocale();
  const headline = t("What changed");
  const description = t(
    "A running log of Deni AI releases. Each entry covers the product changes you can actually use, not internal refactors.",
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Deni AI Changelog",
    itemListElement: changelogEntries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `Deni AI ${entry.version}`,
      description: entry.summary,
    })),
  };

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 pb-20 pt-28 sm:px-6">
        <header className="space-y-4">
          <p className="text-sm font-medium text-primary">{t("Product updates")}</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            {headline}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">{description}</p>
        </header>

        <ol className="relative space-y-10 border-l border-border/70 pl-6 sm:pl-8">
          {changelogEntries.map((entry) => (
            <li key={entry.version} className="relative">
              <Sparkles
                aria-hidden="true"
                className="absolute -left-8 top-2 size-4 bg-background text-primary sm:-left-10"
              />
              <article className="rounded-xl border border-border bg-card p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {entry.version}
                    {entry.codename ? ` · ${entry.codename}` : ""}
                  </h2>
                  <time className="text-sm text-muted-foreground" dateTime={entry.date}>
                    {formatAppDate(entry.date, locale)}
                  </time>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.summary}</p>
                <ul className="mt-4 space-y-3">
                  {entry.highlights.map((highlight) => (
                    <li key={highlight.title}>
                      <p className="text-sm font-medium">{highlight.title}</p>
                      <p className="text-sm leading-6 text-muted-foreground">{highlight.body}</p>
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-5">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">{t("Want the next release on day one?")}</p>
            <p className="text-sm text-muted-foreground">
              {t("Open a chat, or read the guides if you are still choosing a model.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LoginButton />
            <Link
              href="/guides"
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-accent"
            >
              {t("AI Guides")}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
