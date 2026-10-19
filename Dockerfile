# Multi-stage production build for Wasmer / Cloud Container
FROM node:20-alpine AS builder
WORKDIR /app

ENV NODE_OPTIONS="--max-old-space-size=2048"

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Production runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts \
    || npm install --omit=dev --no-audit --no-fund --ignore-scripts

# SESSION_SECRET, ADMIN_PASS, PUBLIC_HOST, DATABASE_URL
# must be injected via Wasmer Secrets (never in this file)

EXPOSE 8080
EXPOSE 3000

CMD ["node", "dist/server/server.cjs"]
