FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm install --workspace=@98plus/shared --workspace=@98plus/api
RUN npm run build -w @98plus/shared
RUN npm run db:generate -w @98plus/api
RUN npm run build -w @98plus/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api ./apps/api
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
