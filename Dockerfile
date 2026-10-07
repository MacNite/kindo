# Kindo image, following the BrewCore/NutriCore multi-stage layout:
#   deps → build → runner
# There is no database yet, so there is no `migrate` stage. When Prisma
# arrives it gets one here, exactly as in BrewCore.
FROM node:22.19.0-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.19.0-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.19.0-alpine AS runner
WORKDIR /app
ARG KINDO_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 KINDO_VERSION=${KINDO_VERSION}
RUN apk add --no-cache wget \
 && addgroup -S kindo -g 1001 \
 && adduser -S kindo -u 1001 -G kindo

# The standalone output carries its own minimal node_modules; nothing else
# from the build stage reaches the runtime image.
COPY --from=build --chown=kindo:kindo /app/.next/standalone ./
COPY --from=build --chown=kindo:kindo /app/.next/static ./.next/static
COPY --from=build --chown=kindo:kindo /app/public ./public
COPY --chown=kindo:kindo docker/entrypoint.sh ./entrypoint.sh
COPY --chown=kindo:kindo docker/healthcheck.sh ./healthcheck.sh
RUN chmod +x ./entrypoint.sh ./healthcheck.sh

USER kindo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD ./healthcheck.sh || exit 1
ENTRYPOINT ["./entrypoint.sh"]
