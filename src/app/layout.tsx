import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getExtracted, getLocale, getMessages } from "next-intl/server";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { defaultLocale } from "@/i18n/locales";
import { GA_ID } from "@/lib/constants";
import { HOME_ALTERNATE_NAMES, HOME_DESCRIPTION, HOME_TITLE } from "@/lib/seo";
import "./globals.css";
import "./themes.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
  ],
};

// Keep metadata free of cookies()/headers() so the document shell can prerender.
// Per-request locale for page content is resolved in LocalizedRoot via next-intl.
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL("https://deniai.app"),
    applicationName: "Deni AI",
    title: {
      default: HOME_TITLE,
      template: "%s | Deni AI",
    },
    description: HOME_DESCRIPTION,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/pwa/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/pwa/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      ],
      apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    keywords: [
      "Deni AI",
      "Deni Chat",
      "denichat",
      "AI chat",
      "ChatGPT alternative",
      "Claude",
      "Gemini",
      "free AI chat",
      "multi-model AI",
    ],
    authors: [{ name: "Deni AI" }],
    creator: "Deni AI",
    publisher: "Deni AI",
    formatDetection: {
      address: false,
      email: false,
      telephone: false,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Deni AI",
    },
    openGraph: {
      type: "website",
      siteName: "Deni AI",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      locale: "en_US",
      images: [
        {
          url: "/og.png",
          width: 800,
          height: 600,
          alt: "Deni AI",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      images: ["/og.png"],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

function safeJsonLd(data: unknown) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** Sync html[lang] from the locale cookie before first paint (avoids FOUC). */
const LOCALE_LANG_SCRIPT = `(function(){try{var p=location.pathname;if(p==="/ja"||p.indexOf("/ja/")===0){document.documentElement.lang="ja";return;}var m=document.cookie.match(/(?:^|; )locale=([^;]*)/);var l=m&&decodeURIComponent(m[1]);if(l==="en"||l==="ja")document.documentElement.lang=l;}catch(e){}})();`;

/**
 * Executable only during SSR HTML parse. On the client, React would not re-run
 * <script> tags, so switch type to text/plain to silence the React 19 warning.
 *
 * The script body is the module constant above rather than a prop, so this sink
 * has no dynamic input path and cannot become an injection point.
 * @see https://nextjs.org/docs/app/guides/preventing-flash-before-hydration
 */
function InlineBootScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: LOCALE_LANG_SCRIPT }}
    />
  );
}

/** Locale resolve is usually fast — avoid an extra full-screen spinner flash. */
function RootLayoutFallback() {
  return <div className="min-h-screen bg-background" />;
}

/**
 * Sequential: next-intl server helpers share request context and can break
 * under concurrent Promise.all during static prerender.
 */
async function loadMessagesForLocale(locale: string) {
  const messages = await getMessages();
  return {
    locale,
    messages,
  };
}

async function loadLocalizedRootMessages() {
  const locale = await getLocale();
  return loadMessagesForLocale(locale);
}

/**
 * Resolves cookie/header-based locale and wraps the app in next-intl.
 * Must sit inside <Suspense> so the root shell can prerender under cacheComponents.
 * ThemeProvider stays outside this boundary so next-themes' blocking script is in
 * the static shell (not streamed client-side where <script> would not execute).
 */
async function LocalizedRoot({ children }: { children: React.ReactNode }) {
  const { locale, messages } = await loadLocalizedRootMessages();
  const t = await getExtracted();

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t("Skip to content")}
      </a>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <div className="min-h-screen">{children}</div>
      </NextIntlClientProvider>
    </>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={defaultLocale} suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${jetbrainsMono.variable} ${inter.variable} font-sans antialiased min-w-full min-h-screen overflow-x-hidden transition-colors duration-500`}
      >
        <InlineBootScript />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd([
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "Deni AI",
                alternateName: [...HOME_ALTERNATE_NAMES],
                url: "https://deniai.app",
                potentialAction: {
                  "@type": "SearchAction",
                  target: "https://deniai.app/new/{search_term_string}",
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "SiteNavigationElement",
                name: [
                  "About",
                  "Use Cases",
                  "AI Models",
                  "Desktop App",
                  "Flixa",
                  "FAQ",
                  "Terms of Service",
                  "Privacy Policy",
                ],
                url: [
                  "https://deniai.app/about",
                  "https://deniai.app/use-cases",
                  "https://deniai.app/models",
                  "https://deniai.app/desktop",
                  "https://deniai.app/flixa",
                  "https://deniai.app/faq",
                  "https://deniai.app/legal/terms",
                  "https://deniai.app/legal/privacy-policy",
                ],
              },
            ]),
          }}
        />
        {/* ThemeProvider must be outside Suspense: next-themes injects a FOUC
            script that only runs when present in the initial HTML parse. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Suspense fallback={<RootLayoutFallback />}>
            <LocalizedRoot>{children}</LocalizedRoot>
          </Suspense>
          <Toaster position="top-center" />
        </ThemeProvider>
        {process.env.NODE_ENV === "production" ? <GoogleAnalytics gaId={GA_ID} /> : null}
      </body>
    </html>
  );
}
