import type { Metadata } from "next";
import { ArrowRight, Code2, Zap, Brain, Terminal, Download } from "lucide-react";
import Link from "next/link";
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { Button } from "@/components/ui/button";
import SiGoogle from "@icons-pack/react-simple-icons/icons/SiGoogle";
import SiWindsurf from "@icons-pack/react-simple-icons/icons/SiWindsurf";
import { publicAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();
  const title = t("Flixa — AI coding agent for VS Code and Cursor");
  const description = t(
    "Flixa is Deni AI's coding agent for VS Code, Cursor, and Windsurf. Official page at deniai.app/flixa — install the extension from the marketplace.",
  );

  return {
    title,
    description,
    alternates: await publicAlternates("/flixa"),
    openGraph: {
      title: `${title} by Deni AI`,
      description,
    },
  };
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative p-6 rounded-lg border border-border bg-card">
      <div className="inline-flex items-center justify-center size-10 rounded-lg bg-secondary text-foreground mb-4">
        <Icon className="size-5" />
      </div>
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function IDECard({
  name,
  description,
  href,
  icon,
}: {
  name: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col items-center p-6 rounded-lg border border-border bg-card transition-colors hover:border-foreground/20"
    >
      <div className="mb-4">{icon}</div>
      <h3 className="text-base font-semibold mb-1">{name}</h3>
      <p className="text-muted-foreground text-sm mb-4">{description}</p>
      <span className="gap-2 inline-flex items-center text-sm font-medium text-foreground group-hover:underline">
        <Download className="size-4" />
        Install
      </span>
    </Link>
  );
}

const flixaJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Flixa",
    alternateName: ["Flixa by Deni AI", "flixa.com"],
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, macOS, Linux",
    url: "https://deniai.app/flixa",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description:
      "AI coding agent extension for VS Code, Cursor, and Windsurf. Provides intelligent code completion, refactoring, and natural language commands.",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Flixa?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Flixa is an AI coding agent extension by Deni AI. It provides intelligent code completion, instant refactoring, and natural language commands directly inside your IDE.",
        },
      },
      {
        "@type": "Question",
        name: "Where is the official Flixa website?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The official Flixa page is https://deniai.app/flixa. Flixa is a Deni AI product for VS Code, Cursor, and Windsurf — there is no separate flixa.com download site.",
        },
      },
      {
        "@type": "Question",
        name: "Which IDEs does Flixa support?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Flixa is available for VS Code (via the official marketplace), Cursor, Windsurf, and Antigravity (via Open VSX Registry).",
        },
      },
      {
        "@type": "Question",
        name: "Is Flixa free?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, Flixa is powered by Deni AI and is free to use.",
        },
      },
    ],
  },
];

export default function FlixaPage() {
  const t = useExtracted();

  return (
    <main className="relative min-h-screen" id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(flixaJsonLd).replace(/</g, "\\u003c") }}
      />
      {/* Hero Section */}
      <section className="relative px-4 pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col items-center text-center">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1 text-sm text-muted-foreground">
              <Code2 className="size-3.5" />
              {t("AI Coding Agent")}
            </div>

            {/* Main headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1] mb-5">
              <span className="block">{t("Flixa")}</span>
              <span className="block mt-1 text-muted-foreground">
                {t("Your AI Coding Partner")}
              </span>
            </h1>

            {/* Subheadline */}
            <p className="max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed mb-8">
              {t(
                "Supercharge your development workflow with AI-powered coding assistance. Available for VS Code, Cursor, Windsurf, and more.",
              )}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                render={
                  <Link
                    href="https://marketplace.visualstudio.com/items?itemName=deniai.flixa"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                nativeButton={false}
              >
                <Download className="size-4" />
                {t("Install for VS Code")}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="group"
                render={<Link href="#platforms" />}
                nativeButton={false}
              >
                {t("View All Platforms")}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </div>

            {/* Social proof */}
            <div className="mt-10 text-sm text-muted-foreground">
              <span>{t("Powered by Deni AI")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
              {t("Why Choose Flixa?")}
            </h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              {t("Built for developers who want to code faster and smarter with AI assistance.")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <FeatureCard
              icon={Brain}
              title={t("Intelligent Code Completion")}
              description={t(
                "Context-aware suggestions that understand your codebase. Write code faster with AI that knows your project.",
              )}
            />
            <FeatureCard
              icon={Zap}
              title={t("Instant Refactoring")}
              description={t(
                "Refactor code with a single command. Flixa understands your intent and transforms code intelligently.",
              )}
            />
            <FeatureCard
              icon={Terminal}
              title={t("Natural Language Commands")}
              description={t(
                "Describe what you want in plain English. Flixa translates your intent into working code.",
              )}
            />
          </div>
        </div>
      </section>

      {/* Platforms Section */}
      <section id="platforms" className="relative px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
              {t("Available Platforms")}
            </h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              {t("Install Flixa on your favorite IDE and start coding smarter.")}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <IDECard
              name="VS Code"
              description={t("Official")}
              href="https://marketplace.visualstudio.com/items?itemName=deniai.flixa"
              icon={
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  className="size-8 fill-foreground"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>Visual Studio Code</title>
                  <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
                </svg>
              }
            />
            <IDECard
              name="Cursor"
              description={t("Open VSX Registry")}
              href="https://open-vsx.org/extension/deniai/flixa"
              icon={
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  className="size-8 fill-foreground"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>Cursor</title>
                  <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
                </svg>
              }
            />
            <IDECard
              name="Windsurf"
              description={t("Open VSX Registry")}
              href="https://open-vsx.org/extension/deniai/flixa"
              icon={<SiWindsurf className="size-8" />}
            />
            <IDECard
              name="Antigravity"
              description={t("Open VSX Registry")}
              href="https://open-vsx.org/extension/deniai/flixa"
              icon={<SiGoogle className="size-8" />}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative px-4 py-16 md:py-24">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-lg border border-border bg-card p-8 md:p-10 text-center">
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-3">
              {t("Ready to Code Smarter?")}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm">
              {t(
                "Join developers who are already building faster with Flixa. Install now and experience the future of coding.",
              )}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                render={
                  <Link
                    href="https://marketplace.visualstudio.com/items?itemName=deniai.flixa"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                nativeButton={false}
              >
                <Download className="size-4" />
                {t("Get Flixa for VS Code")}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="group"
                render={<Link href="/" />}
                nativeButton={false}
              >
                {t("Try Deni AI")}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
