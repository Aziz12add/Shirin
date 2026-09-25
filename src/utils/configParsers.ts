import { ProxyConfig, UserAccount } from '../types';

/**
 * Generate VLESS URI
 * Format: vless://uuid@server:port?type=ws&security=tls&path=...&sni=...&host=...#Remark
 */
export function generateVlessUri(config: ProxyConfig): string {
  const host = config.cleanIp || config.server;
  const port = config.port || 443;
  const uuid = config.uuid || '00000000-0000-0000-0000-000000000000';
  
  const params = new URLSearchParams();
  params.set('type', config.transport || 'ws');
  params.set('security', config.security || 'tls');
  
  if (config.path) params.set('path', config.path);
  if (config.sni || config.host || config.server) {
    params.set('sni', config.sni || config.host || config.server);
  }
  if (config.host) params.set('host', config.host);
  if (config.alpn) params.set('alpn', config.alpn);
  if (config.flow) params.set('flow', config.flow);
  
  if (config.security === 'reality') {
    params.set('security', 'reality');
    params.set('encryption', 'none');
    params.set('fp', 'chrome');
    if (config.realityPublicKey) params.set('pbk', config.realityPublicKey);
    if (config.realityShortId) params.set('sid', config.realityShortId);
    if (config.spiderX) params.set('spx', config.spiderX);
    params.set('flow', config.flow || 'xtls-rprx-vision');
    if (config.sni || config.server) params.set('sni', config.sni || config.server);
  }

  const remark = encodeURIComponent(config.remark || config.name || 'VLESS Node');
  return `vless://${uuid}@${host}:${port}?${params.toString()}#${remark}`;
}

/**
 * Generate Trojan URI
 * Format: trojan://password@server:port?security=tls&type=ws&path=...&sni=...#Remark
 */
export function generateTrojanUri(config: ProxyConfig): string {
  const host = config.cleanIp || config.server;
  const port = config.port || 443;
  const password = encodeURIComponent(config.password || 'password123');
  
  const params = new URLSearchParams();
  params.set('security', config.security || 'tls');
  params.set('type', config.transport || 'ws');
  
  if (config.path) params.set('path', config.path);
  if (config.sni || config.host || config.server) {
    params.set('sni', config.sni || config.host || config.server);
  }
  if (config.host) params.set('host', config.host);
  if (config.alpn) params.set('alpn', config.alpn);

  const remark = encodeURIComponent(config.remark || config.name || 'Trojan Node');
  return `trojan://${password}@${host}:${port}?${params.toString()}#${remark}`;
}

/**
 * Generate VMess URI
 * Format: vmess://<base64-json>
 */
export function generateVmessUri(config: ProxyConfig): string {
  const vmessObj = {
    v: '2',
    ps: config.remark || config.name || 'VMess Node',
    add: config.cleanIp || config.server,
    port: String(config.port || 443),
    id: config.uuid || '00000000-0000-0000-0000-000000000000',
    aid: '0',
    scy: 'auto',
    net: config.transport || 'ws',
    type: 'none',
    host: config.host || config.server || '',
    path: config.path || '/',
    tls: config.security === 'tls' ? 'tls' : '',
    sni: config.sni || config.host || config.server || '',
    alpn: config.alpn || '',
  };

  const jsonStr = JSON.stringify(vmessObj);
  const base64 = typeof window !== 'undefined' 
    ? btoa(unescape(encodeURIComponent(jsonStr)))
    : Buffer.from(jsonStr).toString('base64');
    
  return `vmess://${base64}`;
}

/**
 * Generate HTTP Proxy URI
 * Format: http://user:pass@server:port#Remark
 */
export function generateHttpUri(config: ProxyConfig): string {
  const host = config.cleanIp || config.server;
  const port = config.port || 8080;
  const auth = config.username && config.password 
    ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@`
    : '';
  const remark = encodeURIComponent(config.remark || config.name || 'HTTP Proxy');
  return `http://${auth}${host}:${port}#${remark}`;
}

/**
 * Generate Shadowsocks URI
 */
export function generateShadowsocksUri(config: ProxyConfig): string {
  const host = config.cleanIp || config.server;
  const port = config.port || 8388;
  const method = 'aes-256-gcm';
  const password = config.password || 'password';
  const userInfo = typeof window !== 'undefined'
    ? btoa(`${method}:${password}`)
    : Buffer.from(`${method}:${password}`).toString('base64');
  const remark = encodeURIComponent(config.remark || config.name || 'Shadowsocks');
  return `ss://${userInfo}@${host}:${port}#${remark}`;
}

/**
 * Universal URI generator based on config protocol
 */
export function generateConfigUri(config: ProxyConfig): string {
  switch (config.protocol) {
    case 'vless':
      return generateVlessUri(config);
    case 'trojan':
      return generateTrojanUri(config);
    case 'vmess':
      return generateVmessUri(config);
    case 'http':
      return generateHttpUri(config);
    case 'shadowsocks':
      return generateShadowsocksUri(config);
    default:
      return generateVlessUri(config);
  }
}

/**
 * Convert a list of configs to Base64 subscription string for MahsaNG / V2rayNG
 */
export function generateSubscriptionBase64(configs: ProxyConfig[]): string {
  const uris = configs.filter(c => c.active).map(generateConfigUri).join('\n');
  if (typeof window !== 'undefined') {
    return btoa(unescape(encodeURIComponent(uris)));
  }
  return Buffer.from(uris).toString('base64');
}

/**
 * Personalize configs with a specific user's UUID and Trojan credentials
 */
export function generateUserPersonalizedConfigs(
  user: UserAccount,
  baseConfigs: ProxyConfig[],
  domainOverride?: string
): ProxyConfig[] {
  return baseConfigs
    .filter(c => c.active && (user.allowedConfigs.includes('all') || user.allowedConfigs.includes(c.id)))
    .map(c => {
      const server = domainOverride && c.server.includes('my-app') ? domainOverride : c.server;
      const host = domainOverride && c.host && c.host.includes('my-app') ? domainOverride : (c.host || server);
      const sni = domainOverride && c.sni && c.sni.includes('my-app') ? domainOverride : (c.sni || server);

      return {
        ...c,
        server,
        host,
        sni,
        uuid: user.uuid || c.uuid,
        password: user.trojanPassword || user.token || c.password,
        remark: `${c.remark || c.name} [${user.username}]`,
      };
    });
}

/**
 * Parse standard V2Ray URI into a ProxyConfig object
 */
export function parseConfigUri(uri: string): Partial<ProxyConfig> | null {
  try {
    const trimmed = uri.trim();
    if (trimmed.startsWith('vless://')) {
      const parsed = new URL(trimmed);
      const uuid = parsed.username;
      const server = parsed.hostname;
      const port = parseInt(parsed.port || '443', 10);
      const search = parsed.searchParams;
      const remark = decodeURIComponent(parsed.hash.replace('#', '') || 'Imported VLESS');

      return {
        protocol: 'vless',
        server,
        port,
        uuid,
        transport: (search.get('type') as any) || 'ws',
        security: (search.get('security') as any) || 'tls',
        path: search.get('path') || '/',
        sni: search.get('sni') || server,
        host: search.get('host') || server,
        flow: search.get('flow') || '',
        realityPublicKey: search.get('pbk') || '',
        realityShortId: search.get('sid') || '',
        spiderX: search.get('spx') || '',
        remark,
        name: remark,
        active: true,
      };
    } else if (trimmed.startsWith('trojan://')) {
      const parsed = new URL(trimmed);
      const password = decodeURIComponent(parsed.username);
      const server = parsed.hostname;
      const port = parseInt(parsed.port || '443', 10);
      const search = parsed.searchParams;
      const remark = decodeURIComponent(parsed.hash.replace('#', '') || 'Imported Trojan');

      return {
        protocol: 'trojan',
        server,
        port,
        password,
        transport: (search.get('type') as any) || 'ws',
        security: (search.get('security') as any) || 'tls',
        path: search.get('path') || '/',
        sni: search.get('sni') || server,
        host: search.get('host') || server,
        remark,
        name: remark,
        active: true,
      };
    }
    return null;
  } catch (err) {
    console.error('Failed to parse URI:', err);
    return null;
  }
}

/**
 * Generate Xray server config for Railway Deployment (xray.json)
 */
export function generateRailwayXrayConfig(settings: {
  uuid: string;
  trojanPassword?: string;
  vlessWsPath?: string;
  trojanWsPath?: string;
  port?: number;
}): string {
  const config = {
    log: {
      loglevel: "warning"
    },
    inbounds: [
      {
        port: settings.port || 3000,
        protocol: "vless",
        settings: {
          clients: [
            {
              id: settings.uuid,
              level: 0
            }
          ],
          decryption: "none"
        },
        streamSettings: {
          network: "ws",
          wsSettings: {
            path: settings.vlessWsPath || "/vless-railway"
          }
        }
      },
      {
        port: 3001,
        protocol: "trojan",
        settings: {
          clients: [
            {
              password: settings.trojanPassword || "RayPassword2026",
              level: 0
            }
          ]
        },
        streamSettings: {
          network: "ws",
          wsSettings: {
            path: settings.trojanWsPath || "/trojan-railway"
          }
        }
      }
    ],
    outbounds: [
      {
        protocol: "freedom",
        tag: "direct"
      },
      {
        protocol: "blackhole",
        tag: "blocked"
      }
    ]
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generate Dockerfile for Railway Deploy
 */
export function generateRailwayDockerfile(): string {
  return `FROM teddysun/xray:latest
LABEL maintainer="RayPanel Private Deployment"

# Copy xray configuration file
COPY config.json /etc/xray/config.json

# Expose Railway default PORT
EXPOSE 3000

# Start Xray service
CMD ["xray", "run", "-config", "/etc/xray/config.json"]
`;
}

/**
 * Generate Railway railway.json template
 */
export function generateRailwayJsonConfig(): string {
  return JSON.stringify({
    "$schema": "https://railway.com/railway.schema.json",
    "build": {
      "builder": "DOCKERFILE",
      "dockerfilePath": "Dockerfile"
    },
    "deploy": {
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 10
    }
  }, null, 2);
}

/**
 * Generate wasmer.toml for Wasmer Edge deployment
 */
export function generateWasmerToml(packageName = 'raypanel-app'): string {
  return `[package]
name = "${packageName}"
version = "0.1.0"
description = "RayPanel - Proxy & MahsaNG Subscription Manager on Wasmer Edge"
license = "MIT"

[dependencies]
"wasmer/static-web-server" = "^1"

[[command]]
name = "server"
module = "wasmer/static-web-server:webserver"
runner = "wasi"

[fs]
"/public" = "dist"
`;
}

/**
 * Generate app.yaml for Wasmer Edge deployment
 */
export function generateWasmerAppYaml(appName = 'raypanel-app'): string {
  return `kind: wasmer.io/App.v0
name: ${appName}
package: .
env:
  NODE_ENV: production
  PORT: "8080"
capabilities:
  instaboot: true
`;
}

/**
 * Generate Dockerfile for Wasmer / Container deployment
 */
export function generateWasmerDockerfile(): string {
  return `# Multi-stage production build for Wasmer / Container Deploy
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
`;
}

/**
 * Generate CLI commands for Wasmer deployment
 */
export function generateWasmerCliCommands(): string {
  return `# 1. Install Wasmer CLI (Linux / macOS / WSL)
curl https://get.wasmer.io -sSfL | sh

# For Windows PowerShell:
# iwr https://win.wasmer.io -useb | iex

# 2. Authenticate with Wasmer
wasmer login

# 3. Build project locally
npm run build

# 4. Deploy directly to Wasmer Edge
wasmer deploy
`;
}

/**
 * Format bytes to readable human unit (KB, MB, GB)
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
