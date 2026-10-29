/**
 * Text generators for deployment files (Wasmer Edge and Railway).
 * Pure string builders with no dependency on the proxy/config code.
 */

// ==========================================
// Wasmer
// ==========================================

export function generateWasmerToml(packageName = 'shirin'): string {
  return `[package]
name = "${packageName}"
version = "0.1.0"
description = "Shirin - Proxy & subscription manager on Wasmer Edge"
license = "MIT"
entrypoint = "server"

[dependencies]
"wasmer/edgejs" = "0.2.5"

[fs]
"/app" = "."

[[command]]
name = "server"
module = "wasmer/edgejs:edge"
runner = "https://webc.org/runner/wasi"

[command.annotations.wasi]
main-args = ["/app/dist/server/server.cjs"]
env = [
  "NODE_ENV=production",
  "PORT=8080",
  "HOME=/tmp",
  "DATA_DIR=/tmp/shirin-data"
]
`;
}

export function generateWasmerAppYaml(appName = 'shirin'): string {
  return `kind: wasmer.io/App.v0
name: ${appName}
package: .

# Secrets (SESSION_SECRET, ADMIN_PASS, DATABASE_URL) belong in the Wasmer dashboard, not in this file.
env:
  NODE_ENV: "production"
  PORT: "8080"
  PUBLIC_HOST: "${appName}.wasmer.app"

capabilities:
  instaboot:
    requests:
      - path: /

locality:
  regions:
    - fr-roub1
`;
}

/** The server is bundled into one self-contained file, so the runtime image needs no node_modules. */
export function generateWasmerDockerfile(): string {
  return `# Multi-stage build: the runtime image only needs the built output
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/server/server.cjs"]
`;
}

export function generateWasmerCliCommands(): string {
  return `# 1. Install Wasmer CLI (Linux / macOS / WSL)
curl https://get.wasmer.io -sSfL | sh

# For Windows PowerShell:
# iwr https://win.wasmer.io -useb | iex

# 2. Authenticate with Wasmer
wasmer login

# 3. Set these in the Wasmer dashboard (never commit them):
#    SESSION_SECRET  long random string, must never change
#    ADMIN_PASS      strong admin password
#    PUBLIC_HOST     yourapp.wasmer.app
#    DATABASE_URL    postgres://... (durable storage)

# 4. Build and deploy
npm run build
wasmer deploy
`;
}

// ==========================================
// Railway
// ==========================================

export function generateRailwayXrayConfig(settings: {
  uuid: string;
  trojanPassword?: string;
  vlessWsPath?: string;
  trojanWsPath?: string;
  port?: number;
}): string {
  const config = {
    log: { loglevel: 'warning' },
    inbounds: [
      {
        port: settings.port || 3000,
        protocol: 'vless',
        settings: { clients: [{ id: settings.uuid, level: 0 }], decryption: 'none' },
        streamSettings: { network: 'ws', wsSettings: { path: settings.vlessWsPath || '/vless-railway' } }
      },
      {
        port: 3001,
        protocol: 'trojan',
        settings: {
          // No built-in default password: a shared default would let anyone use the node.
          clients: [{ password: settings.trojanPassword || 'CHANGE_ME_TROJAN_PASSWORD', level: 0 }]
        },
        streamSettings: { network: 'ws', wsSettings: { path: settings.trojanWsPath || '/trojan-railway' } }
      }
    ],
    outbounds: [
      { protocol: 'freedom', tag: 'direct' },
      { protocol: 'blackhole', tag: 'blocked' }
    ]
  };

  return JSON.stringify(config, null, 2);
}

export function generateRailwayDockerfile(): string {
  return `FROM teddysun/xray:latest
LABEL maintainer="Shirin Private Deployment"

# Copy xray configuration file
COPY config.json /etc/xray/config.json

# Expose Railway default PORT
EXPOSE 3000

# Start Xray service
CMD ["xray", "run", "-config", "/etc/xray/config.json"]
`;
}

export function generateRailwayJsonConfig(): string {
  return JSON.stringify({
    $schema: 'https://railway.com/railway.schema.json',
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 }
  }, null, 2);
}
