# Kindo image, following the BrewCore/NutriCore multi-stage layout:
#   deps → build → prod-deps → migrate (one-shot, carries the Prisma CLI)
#                            → runner  (long-running app, no Prisma CLI)
FROM node:22.19.0-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM node:22.19.0-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No database is needed at build time: every page renders on request.
RUN npx prisma generate && npm run build

# Production dependencies only, so the runtime image carries no build tooling.
FROM node:22.19.0-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

# The migration runner: applies migrations, loads the demo family into an
# empty database when KINDO_DEMO=true, and exits. The only image with the Prisma CLI.
FROM node:22.19.0-alpine AS migrate
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat \
 && addgroup -S kindo -g 1001 \
 && adduser -S kindo -u 1001 -G kindo
COPY --from=prod-deps --chown=kindo:kindo /app/node_modules ./node_modules
COPY --chown=kindo:kindo package.json tsconfig.json ./
COPY --chown=kindo:kindo prisma ./prisma
# The demo seed and the domain code it builds on.
COPY --chown=kindo:kindo src/lib ./src/lib
COPY --chown=kindo:kindo src/server/demo ./src/server/demo
COPY --chown=kindo:kindo src/server/events.ts ./src/server/events.ts
COPY --chown=kindo:kindo docker/migrate.sh ./migrate.sh
RUN chmod +x ./migrate.sh
USER kindo
ENTRYPOINT ["./migrate.sh"]

FROM node:22.19.0-alpine AS runner
WORKDIR /app
ARG KINDO_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 KINDO_VERSION=${KINDO_VERSION} \
    KINDO_CACHE_DIR=/data/cache
RUN apk add --no-cache libc6-compat wget \
 && addgroup -S kindo -g 1001 \
 && adduser -S kindo -u 1001 -G kindo \
 && mkdir -p /data/cache && chown -R kindo:kindo /data
# Proxied Immich photos (§19.6). A named volume keeps them across restarts.
VOLUME /data/cache

# The standalone output carries the server bundle; nothing else from the build
# stage reaches the runtime image.
COPY --from=build --chown=kindo:kindo /app/.next/standalone ./
COPY --from=build --chown=kindo:kindo /app/.next/static ./.next/static
COPY --from=build --chown=kindo:kindo /app/public ./public
# Overlay the production dependency tree (the Prisma engine), then remove the
# Prisma CLI: it belongs only in the migrate image, and its transitive packages
# have no business in a network-facing container.
COPY --from=prod-deps --chown=kindo:kindo /app/node_modules ./node_modules
RUN rm -rf node_modules/prisma node_modules/@prisma/config node_modules/@prisma/engines \
           node_modules/effect node_modules/deepmerge-ts node_modules/.bin/prisma
COPY --chown=kindo:kindo docker/entrypoint.sh ./entrypoint.sh
COPY --chown=kindo:kindo docker/healthcheck.sh ./healthcheck.sh
RUN chmod +x ./entrypoint.sh ./healthcheck.sh

USER kindo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ./healthcheck.sh || exit 1
ENTRYPOINT ["./entrypoint.sh"]
