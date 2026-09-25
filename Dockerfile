# Multi-stage production build for Wasmer / Cloud Container
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN npm ci --only=production --ignore-scripts || npm install --omit=dev

EXPOSE 8080
EXPOSE 3000

CMD ["node", "dist/server.cjs"]
