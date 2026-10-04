# syntax=docker/dockerfile:1
#
# Dokploy (Dockerfile build)
# -------------------------
# Application settings:
#   Build Type:        Dockerfile
#   Dockerfile path:   Dockerfile
#   Docker context:    .
#   Port:              3000
#
# Environment (service Environment tab):
#   - Put ALL required secrets/public vars there (same as .env.production).
#   - Add the same keys under Build Time Arguments (or mark them build-time)
#     so Dokploy passes them as `docker build --build-arg`. The builder stage
#     declares matching ARG/ENV so `next build` sees real prod values.
#   - NEXT_PUBLIC_* MUST be build-time (embedded into the client bundle).
#   - Server secrets are also injected at build for `@t3-oss/env-nextjs`
#     validation / prerender; runtime still uses service Environment.
#   - Leave Docker layer/BuildKit cache enabled. `.next/cache` is a cache
#     mount so later deploys compile incrementally on the same host.
#
# Local:
#   docker build -t deni-ai .
#   # With prod public/client values (repeat --build-arg per key, or use Dokploy):
#   docker build -t deni-ai --build-arg NEXT_PUBLIC_BETTER_AUTH_URL=https://example.com .
#   docker run --rm -p 3000:3000 --env-file .env.production deni-ai

# ---------------------------------------------------------------------------
# Install dependencies (pnpm workspaces + pnpm-lock.yaml)
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN npm install --global pnpm@12.8.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/disposable-email-domains ./packages/disposable-email-domains
RUN --mount=type=cache,id=deni-ai-pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir=/pnpm/store

# ---------------------------------------------------------------------------
# Build (Next.js production build)
# Node.js runs Next's compiler and workers.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
  NODE_ENV=production \
  SKIP_TYPECHECK=1

COPY --from=deps /app/packages ./packages
COPY . .

# Dokploy / `docker build --build-arg` inject service env here.
# Core keys keep placeholder defaults so a bare `docker build` still compiles.
# Provider/integration keys have no default, so missing keys disable their
# dependent features; emptyStringAsUndefined in src/env.ts treats "" as unset.
ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ARG BETTER_AUTH_SECRET=01234567890123456789012345678901
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG GITHUB_CLIENT_ID
ARG GITHUB_CLIENT_SECRET
ARG STRIPE_SECRET_KEY
ARG STRIPE_WEBHOOK_SECRET
ARG STRIPE_FLASH_OFFER_COUPON_ID
ARG OPENROUTER_API_KEY
ARG DENI_API_KEY
ARG DENI_API_BASE_URL
ARG EXA_API_KEY
ARG TURNSTILE_SECRET_KEY
ARG RESEND_API_KEY
ARG UPSTASH_REDIS_REST_URL
ARG UPSTASH_REDIS_REST_TOKEN
ARG UPLOADTHING_TOKEN
ARG NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_BILLING_DISABLED
ARG NEXT_PUBLIC_SENTRY_DSN

# Promote ARG → ENV so `next build` / env.ts validation / NEXT_PUBLIC inlining
# all see production values when Dokploy (or --build-arg) supplies them.
ENV DATABASE_URL=$DATABASE_URL \
  BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET \
  GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
  GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET \
  GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID \
  GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET \
  STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY \
  STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET \
  STRIPE_FLASH_OFFER_COUPON_ID=$STRIPE_FLASH_OFFER_COUPON_ID \
  OPENROUTER_API_KEY=$OPENROUTER_API_KEY \
  DENI_API_KEY=$DENI_API_KEY \
  DENI_API_BASE_URL=$DENI_API_BASE_URL \
  EXA_API_KEY=$EXA_API_KEY \
  TURNSTILE_SECRET_KEY=$TURNSTILE_SECRET_KEY \
  RESEND_API_KEY=$RESEND_API_KEY \
  UPSTASH_REDIS_REST_URL=$UPSTASH_REDIS_REST_URL \
  UPSTASH_REDIS_REST_TOKEN=$UPSTASH_REDIS_REST_TOKEN \
  UPLOADTHING_TOKEN=$UPLOADTHING_TOKEN \
  NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL \
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
  NEXT_PUBLIC_BILLING_DISABLED=$NEXT_PUBLIC_BILLING_DISABLED \n  NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# Mount dependencies from the install stage instead of copying thousands of
# files into the Node builder. This avoids a slow 40+ second node_modules COPY;
# the mount is available for the build and is not copied into the runtime image.
# Persist Turbopack's filesystem cache across Dokploy deploys on this host.
RUN --mount=type=bind,from=deps,source=/app/node_modules,target=/app/node_modules \
  --mount=type=cache,id=deni-ai-next,target=/app/.next/cache \
  node ./node_modules/next/dist/bin/next build

# Turbopack emits aliases for external packages under `.next/node_modules`.
# External aliases can point to absolute paths in the builder's virtual
# store, which would be broken after only `.next/standalone` is copied to the
# runtime image. Re-home the aliases to the traced virtual store that
# standalone already contains.
RUN set -eu; \
  alias_dir=.next/standalone/.next/node_modules; \
  if [ -d "$alias_dir" ]; then \
    for alias in "$alias_dir"/*; do \
      [ -L "$alias" ] || continue; \
      target="$(readlink "$alias")"; \
      case "$target" in \
        /app/node_modules/.pnpm/*) \
          store_path="${target#/app/node_modules/.pnpm/}"; \
          traced_path=".next/standalone/node_modules/.pnpm/$store_path"; \
          [ -e "$traced_path" ] || { echo "Missing traced external package: $traced_path" >&2; exit 1; }; \
          rm "$alias"; \
          ln -s "../../node_modules/.pnpm/$store_path" "$alias"; \
          ;; \
      esac; \
    done; \
  fi

# ---------------------------------------------------------------------------
# Runtime (Next.js standalone + Node.js)
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# NODE_OPTIONS caps the V8 heap at 75% of the container memory limit so GC runs before
# the kernel OOM-kills the process (leaves headroom for buffers/native memory).
# Dokploy / Traefik reach the container on this port.
# HOSTNAME=0.0.0.0 is only the listen bind address (not the public site URL).
# Never set NEXT_PUBLIC_BETTER_AUTH_URL to http://0.0.0.0:3000 — use the real
# public origin (e.g. https://deniai.app) at build time.
ENV PORT=3000 \
  HOSTNAME=0.0.0.0 \
  NEXT_TELEMETRY_DISABLED=1 \
  NODE_ENV=production \
  NODE_OPTIONS=--max-old-space-size-percentage=75

# Official Node.js images include a non-root `node` user/group.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
