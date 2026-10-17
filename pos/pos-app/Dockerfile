# =====================================================================
# pos / pos-app — Next.js (POS counter app (web / PWA))
#
# Dokploy: Build Type = Dockerfile, Build Path = /,
#   Docker File = pos/pos-app/Dockerfile,
#   Docker Context Path = pos/pos-app,
#   Watch Paths = pos/pos-app/**
#   Full steps: pos/DOKPLOY_STAGING.md step 6.
#   Environment -> Build-time Arguments: the ARG values below
#   Environment -> Runtime variables   : see .env.example
#   Domain -> port 3000
#
# NEXT_PUBLIC_* values are baked into the JS bundle at build time, so
# changing one requires a rebuild (Dokploy: Rebuild).
#
# STATUS: app code added (TASKS P2-10). next.config.js sets
# `output: "standalone"`; the build needs no backend and no build args (the
# NEXT_PUBLIC_* values below are only a fallback for MEDUSA_BACKEND_URL).
# =====================================================================
ARG NODE_VERSION=22

# ---------- build ----------
FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- build-time arguments (set in Dokploy "Build-time Arguments") ----
# Public backend URL the browser calls, e.g. https://api.example.com
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL=""
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=${NEXT_PUBLIC_MEDUSA_BACKEND_URL}
# This app's public URL
ARG NEXT_PUBLIC_BASE_URL=""
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g "$(node -p "require('./package.json').packageManager")" \
 && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---------- runtime ----------
FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
