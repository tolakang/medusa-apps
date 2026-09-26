# =====================================================================
# ecommerce / storefront — Next.js (customer storefront)
#
# Dokploy: Build Type = Dockerfile, Build Path = /,
#   Docker File = ecommerce/storefront/Dockerfile,
#   Docker Context Path = ecommerce/storefront,
#   Watch Paths = ecommerce/storefront/**
#   Environment -> Build-time Arguments: the ARG values below
#   Environment -> Runtime variables   : see .env.example
#   Domain -> port 8000
#   Full steps: ecommerce/DOKPLOY_STAGING.md section 4.
#
# NEXT_PUBLIC_* values are baked into the JS bundle at build time, so
# changing one requires a rebuild (Dokploy: Rebuild).
# Requires `output: "standalone"` in next.config.
# =====================================================================
ARG NODE_VERSION=22

# ---------- build ----------
FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- build-time arguments (set in Dokploy "Build-time Arguments") ----
# PUBLIC backend URL, e.g. https://api.example.com (used by the browser and the build; baked in)
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL=""
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=${NEXT_PUBLIC_MEDUSA_BACKEND_URL}
# Publishable API key (Admin > Settings > Publishable API Keys)
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=""
ENV NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY}
# This storefront's public URL, e.g. https://shop.example.com
ARG NEXT_PUBLIC_BASE_URL=""
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}
# Fallback country code (ISO-2 lowercase)
ARG NEXT_PUBLIC_DEFAULT_REGION="us"
ENV NEXT_PUBLIC_DEFAULT_REGION=${NEXT_PUBLIC_DEFAULT_REGION}
# Stripe publishable key (empty if not using Stripe)
ARG NEXT_PUBLIC_STRIPE_KEY=""
ENV NEXT_PUBLIC_STRIPE_KEY=${NEXT_PUBLIC_STRIPE_KEY}
# Hostname of product images (your S3/R2 bucket) for next/image
ARG S3_IMAGE_HOSTNAME=""
ENV S3_IMAGE_HOSTNAME=${S3_IMAGE_HOSTNAME}
# Allowed image path pattern
ARG S3_IMAGE_PATHNAME="/**"
ENV S3_IMAGE_PATHNAME=${S3_IMAGE_PATHNAME}

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
    PORT=8000
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 8000
CMD ["node", "server.js"]
