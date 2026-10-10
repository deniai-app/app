import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const skipTypecheck = process.env.SKIP_TYPECHECK === "1";

const nextConfig: NextConfig = {
  /* config options here */
  // Smaller runtime image for Docker / self-hosting (Vercel ignores this).
  output: "standalone",
  cacheComponents: true,
  // One App Shell per route (shared across every /chat/[id] link). Required for
  // instant chat list navigations under Cache Components.
  partialPrefetching: true,
  reactCompiler: true,
  poweredByHeader: false,
  // Docker / Dokploy sets SKIP_TYPECHECK=1 so tsc does not contend with Turbopack
  // on small VPS CPUs. Run `pnpm run typecheck` locally or in CI instead.
  typescript: {
    ignoreBuildErrors: skipTypecheck,
  },
  // Keep server dependencies inside the standalone bundle. An isolated
  // virtual store can otherwise leave Turbopack external aliases unresolved
  // after the standalone output is copied into the runtime image.
  transpilePackages: [
    "stripe",
    "drizzle-orm",
    "@neondatabase/serverless",
    "postgres",
    "cheerio",
    "prettier",
  ],
  // The AI SDK loads `undici` at runtime via createRequire(), which bundlers
  // cannot see. Keep it external so standalone output traces it into
  // node_modules (otherwise: "Cannot find module 'undici'").
  serverExternalPackages: ["undici"],
  // Tree-shake large icon/date packages more aggressively
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@icons-pack/react-simple-icons",
      "motion",
      "@dnd-kit/core",
      "@dnd-kit/utilities",
      "@base-ui/react",
    ],
    turbopackFileSystemCacheForBuild: true,
    turbopackRustReactCompiler: true,
  },
  async redirects() {
    return [
      // The legacy migrator site is gone; chat imports now live in Settings.
      { source: "/migration", destination: "/settings/import", permanent: true },
      { source: "/ja/migration", destination: "/settings/import", permanent: true },
      // The affiliate program was removed; reset credits now live on the billing page.
      { source: "/invite/:code", destination: "/auth/sign-up", permanent: true },
      { source: "/settings/affiliate", destination: "/settings/billing", permanent: true },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(self), geolocation=()",
      },
      {
        // srcDoc artifact previews inherit this CSP and import React from esm.sh.
        key: "Content-Security-Policy",
        value:
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://www.googletagmanager.com https://js.stripe.com https://*.js.stripe.com https://pagead2.googlesyndication.com https://static.cloudflareinsights.com https://esm.sh; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss: https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net; frame-src https://challenges.cloudflare.com https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com; object-src 'none'; base-uri 'self'",
      },
    ];

    const marketingCacheHeaders = [
      {
        key: "Cache-Control",
        value: "public, s-maxage=3600, stale-while-revalidate=86400",
      },
      { key: "Vary", value: "x-locale" },
    ];

    const legalCacheHeaders = [
      {
        key: "Cache-Control",
        value: "public, s-maxage=86400, stale-while-revalidate=604800",
      },
      { key: "Vary", value: "x-locale" },
    ];

    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/home",
        headers: marketingCacheHeaders,
      },
      {
        source: "/ja",
        headers: marketingCacheHeaders,
      },
      {
        source: "/ja/:path*",
        headers: marketingCacheHeaders,
      },
      {
        source: "/about",
        headers: marketingCacheHeaders,
      },
      {
        source: "/use-cases",
        headers: marketingCacheHeaders,
      },
      {
        source: "/guides/:path*",
        headers: marketingCacheHeaders,
      },
      {
        source: "/blog",
        headers: marketingCacheHeaders,
      },
      {
        source: "/blog/:path*",
        headers: marketingCacheHeaders,
      },
      {
        source: "/models",
        headers: marketingCacheHeaders,
      },
      {
        source: "/flixa",
        headers: marketingCacheHeaders,
      },
      {
        source: "/desktop",
        headers: marketingCacheHeaders,
      },
      {
        source: "/legal/privacy-policy",
        headers: marketingCacheHeaders,
      },
      {
        source: "/legal/:path*",
        headers: legalCacheHeaders,
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-cache, no-store" }],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin({
  experimental: {
    // Required for useExtracted/getExtracted: enables the Turbo/Webpack loader
    // that rewrites them to useTranslations/getTranslations at build time.
    extract: true,
    srcPath: "./src",
    messages: {
      path: "./messages",
      format: "json",
      sourceLocale: "en",
      locales: ["en", "ja"],
    },
  },
});

const intlConfig = withNextIntl(nextConfig);

// Upload client/server source maps so Sentry stack traces are readable. Only
// active when SENTRY_AUTH_TOKEN is present at build time (SENTRY_ORG and
// SENTRY_PROJECT are read from the environment); other builds are unchanged.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(intlConfig, {
      silent: !process.env.CI,
      widenClientFileUpload: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      telemetry: false,
    })
  : intlConfig;
