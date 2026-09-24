# =====================================================================
# wholesale / backend — Medusa server + worker (same image, two Dokploy apps)
#
# Dokploy: Build Type = Dockerfile, Build Path = /wholesale/backend
#   server app : MEDUSA_WORKER_MODE=server   (domain -> port 9000)
#   worker app : MEDUSA_WORKER_MODE=worker, DISABLE_MEDUSA_ADMIN=true,
#                RUN_MIGRATIONS=false        (no domain)
#
# STATUS: ready template. Builds once the Medusa app code is added
# (BUILD_PLAN.md §4.1). Base images are fully qualified for Podman/Buildah.
# =====================================================================
ARG NODE_VERSION=22

# ---------- build ----------
FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app

# Optional: absolute backend URL baked into the admin dashboard.
# Leave empty when the admin is served by this same app (recommended).
ARG MEDUSA_BACKEND_URL=""
ENV MEDUSA_BACKEND_URL=${MEDUSA_BACKEND_URL}

# Exact pnpm version from package.json "packageManager"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g "$(node -p "require('./package.json').packageManager")" \
 && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# `medusa build` does not copy the lockfile into .medusa/server
WORKDIR /app/.medusa/server
RUN cp /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./ \
 && pnpm install --prod --frozen-lockfile

# ---------- runtime ----------
FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=9000
WORKDIR /app

COPY --from=build --chown=node:node /app/.medusa/server ./
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 9000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["start"]
