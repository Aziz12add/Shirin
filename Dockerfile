# Multi-stage build: the runtime image only needs the built output.
# The server is bundled into one self-contained file (dist/server/server.cjs),
# so the runtime image needs no node_modules.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/dist ./dist

# SESSION_SECRET, ADMIN_PASS, PUBLIC_HOST, DATABASE_URL
# must be injected via Wasmer Secrets (never in this file)

EXPOSE 8080
EXPOSE 3000

CMD ["node", "dist/server/server.cjs"]
