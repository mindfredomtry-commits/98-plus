# cache-bust-2026-06-28-phase12-diag
FROM node:20-alpine AS builder
WORKDIR /app

# Railway service variables must be declared as ARG to reach `next build`.
# Set NEXT_PUBLIC_PHASE12_DIAG=1 on the @98plus/web Railway service before deploy.
# TEMP Account-2 boot diagnosis: NEXT_PUBLIC_BOOT_GATE_DIAG=1 then redeploy WEB.
ARG NEXT_PUBLIC_API_URL=https://98plusapi-production.up.railway.app
ARG NEXT_PUBLIC_WS_URL=wss://98plusapi-production.up.railway.app/ws
ARG NEXT_PUBLIC_BOT_USERNAME=Ninety_eight_pluss_Bot
ARG NEXT_PUBLIC_PHASE12_DIAG
ARG NEXT_PUBLIC_BOOT_GATE_DIAG
ARG NEXT_PUBLIC_WHAT_TRANSITION_DIAG
ARG NEXT_PUBLIC_DEV_AUTH_ENABLED
ARG NEXT_PUBLIC_BUILD_TIMESTAMP
ARG RAILWAY_GIT_COMMIT_SHA
ARG GITHUB_SHA

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_BOT_USERNAME=$NEXT_PUBLIC_BOT_USERNAME
ENV NEXT_PUBLIC_PHASE12_DIAG=$NEXT_PUBLIC_PHASE12_DIAG
ENV NEXT_PUBLIC_BOOT_GATE_DIAG=$NEXT_PUBLIC_BOOT_GATE_DIAG
ENV NEXT_PUBLIC_WHAT_TRANSITION_DIAG=$NEXT_PUBLIC_WHAT_TRANSITION_DIAG
ENV NEXT_PUBLIC_DEV_AUTH_ENABLED=$NEXT_PUBLIC_DEV_AUTH_ENABLED
ENV NEXT_PUBLIC_BUILD_TIMESTAMP=${NEXT_PUBLIC_BUILD_TIMESTAMP}
ENV NEXT_PUBLIC_BUILD_COMMIT=${RAILWAY_GIT_COMMIT_SHA:-$GITHUB_SHA}

RUN echo "[docker-build-env] NEXT_PUBLIC_PHASE12_DIAG=${NEXT_PUBLIC_PHASE12_DIAG:-<unset>}" && \
    echo "[docker-build-env] NEXT_PUBLIC_BOOT_GATE_DIAG=${NEXT_PUBLIC_BOOT_GATE_DIAG:-<unset>}" && \
    echo "[docker-build-env] NEXT_PUBLIC_WHAT_TRANSITION_DIAG=${NEXT_PUBLIC_WHAT_TRANSITION_DIAG:-<unset>}" && \
    echo "[docker-build-env] NEXT_PUBLIC_DEV_AUTH_ENABLED=${NEXT_PUBLIC_DEV_AUTH_ENABLED:-<unset>}" && \
    echo "[docker-build-env] NEXT_PUBLIC_BOT_USERNAME=${NEXT_PUBLIC_BOT_USERNAME:-<unset>}" && \
    echo "[docker-build-env] NEXT_PUBLIC_BUILD_TIMESTAMP=${NEXT_PUBLIC_BUILD_TIMESTAMP:-<unset>}" && \
    echo "[docker-build-env] NEXT_PUBLIC_BUILD_COMMIT=${NEXT_PUBLIC_BUILD_COMMIT:-<unset>}"

COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm install --workspace=@98plus/shared --workspace=@98plus/web
RUN npm run build -w @98plus/shared
RUN NEXT_PUBLIC_BUILD_TIMESTAMP="${NEXT_PUBLIC_BUILD_TIMESTAMP:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" \
    npm run build -w @98plus/web

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
