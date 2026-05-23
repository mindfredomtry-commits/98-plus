# cache-bust-2026-05-23-v1
FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=https://98plusapi-production.up.railway.app
ARG NEXT_PUBLIC_WS_URL=wss://98plusapi-production.up.railway.app/ws
ENV NEXT_PUBLIC_API_URL=https://98plusapi-production.up.railway.app
ENV NEXT_PUBLIC_WS_URL=wss://98plusapi-production.up.railway.app/ws
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm install --workspace=@98plus/shared --workspace=@98plus/web
RUN npm run build -w @98plus/shared
RUN npm run build -w @98plus/web

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
