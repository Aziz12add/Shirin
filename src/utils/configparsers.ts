import { ProxyConfig, UserAccount } from '../types';

// Deployment file generators now live in ./deployTemplates. Re-exported so existing imports keep working;
// switch imports to './deployTemplates' and delete this line when convenient.
export * from './deployTemplates';

/** Protocols the embedded server can actually serve (and therefore the only ones put in subscriptions). */
const RUNTIME_PROTOCOLS = ['vless', 'trojan'];

/** Old seeds used "my-app.wasmer.app" as a stand-in host; it is swapped for the real host per request. */
const PLACEHOLDER_HOST = /^my-app(\.|$)/;

// ==========================================
// Helpers
// ==========================================
const toBase64 = (text: string): string => {
  if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf-8').toString('base64');
  const bytes = new TextEncoder().encode(text); // browser path (no deprecated unescape)
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const formatHost = (host: string): string => (host.includes(':') && !host.startsWith('[') ? `[${host}]` : host);

/** Destination host: the clean IP when enabled, otherwise the server domain. */
const targetHost = (c: ProxyConfig): string => formatHost(c.useCleanIp && c.cleanIp ? c.cleanIp : c.server);

const encodedRemark = (c: ProxyConfig, fallback: string): string => encodeURIComponent(c.remark || c.name || fallback);

/**
 * type / security / path / sni / host / alpn, shared by VLESS and Trojan.
 * SNI and Host keep the real domain even when a clean IP is the destination, so the TLS handshake stays valid.
 */
function transportParams(c: ProxyConfig): URLSearchParams {
  const p = new URLSearchParams();
  p.set('type', c.transport || 'ws');
  p.set('security', c.security || 'tls');
  if (c.path) p.set('path', c.path);
  const domain = c.host || c.sni || c.server;
  if (domain) {
    p.set('sni', c.sni || domain);
    p.set('host', c.host || domain);
  }
  if (c.alpn) p.set('alpn', c.alpn);
  return p;
}

// ==========================================
// URI generators
// A link without credentials is never emitted (empty string): a placeholder UUID/password
// produces a link that looks fine but can never connect, which is very hard to debug.
// ==========================================

/** vless://uuid@host:port?encryption=none&type=ws&security=tls&path=...&sni=...&host=...#Remark */
export function generateVlessUri(config: ProxyConfig): string {
  if (!config.uuid) return '';

  const params = transportParams(config);
  params.set('encryption', 'none'); // required by the VLESS spec for every VLESS link
  if (config.flow) params.set('flow', config.flow);

  if (config.security === 'reality') {
    params.set('fp', 'chrome');
    if (config.realityPublicKey) params.set('pbk', config.realityPublicKey);
    if (config.realityShortId) params.set('sid', config.realityShortId);
    if (config.spiderX) params.set('spx', config.spiderX);
    params.set('flow', config.flow || 'xtls-rprx-vision');
    params.set('sni', config.sni || config.server);
  }

  // Fragment (anti-censorship), understood by MahsaNG / v2rayNG / Xray-core
  if (config.fragment) {
    const length = config.fragmentLength || '10-50';
    const interval = config.fragmentInterval || '20-50';
    const packets = config.fragmentPackets || '1-3';
    params.set('fragment', `${length},${interval},${packets}`);
    params.set('fragmentLength', length);
    params.set('fragmentInterval', interval);
    params.set('fragmentPackets', packets);
  }

  return `vless://${config.uuid}@${targetHost(config)}:${config.port || 443}?${params.toString()}#${encodedRemark(config, 'VLESS Node')}`;
}

/** trojan://password@host:port?security=tls&type=ws&path=...&sni=...#Remark */
export function generateTrojanUri(config: ProxyConfig): string {
  if (!config.password) return '';
  const params = transportParams(config);
  return `trojan://${encodeURIComponent(config.password)}@${targetHost(config)}:${config.port || 443}?${params.toString()}#${encodedRemark(config, 'Trojan Node')}`;
}

// --- Not served by the embedded server; kept for the UI / manual export only ---

/** vmess://<base64-json> */
export function generateVmessUri(config: ProxyConfig): string {
  if (!config.uuid) return '';
  const vmess = {
    v: '2',
    ps: config.remark || config.name || 'VMess Node',
    add: config.useCleanIp && config.cleanIp ? config.cleanIp : config.server,
    port: String(config.port || 443),
    id: config.uuid,
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
  return `vmess://${toBase64(JSON.stringify(vmess))}`;
}

/** http://user:pass@host:port#Remark */
export function generateHttpUri(config: ProxyConfig): string {
  const auth = config.username && config.password
    ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@`
    : '';
  return `http://${auth}${targetHost(config)}:${config.port || 8080}#${encodedRemark(config, 'HTTP Proxy')}`;
}

/** ss://base64(method:password)@host:port#Remark */
export function generateShadowsocksUri(config: ProxyConfig): string {
  if (!config.password) return '';
  const userInfo = toBase64(`aes-256-gcm:${config.password}`);
  return `ss://${userInfo}@${targetHost(config)}:${config.port || 8388}#${encodedRemark(config, 'Shadowsocks')}`;
}

/** Link for any config; empty string when the protocol is unknown or credentials are missing. */
export function generateConfigUri(config: ProxyConfig): string {
  switch (config.protocol) {
    case 'vless': return generateVlessUri(config);
    case 'trojan': return generateTrojanUri(config);
    case 'vmess': return generateVmessUri(config);
    case 'http': return generateHttpUri(config);
    case 'shadowsocks': return generateShadowsocksUri(config);
    default: return '';
  }
}

// ==========================================
// Subscriptions
// ==========================================

/** Base64 subscription body for MahsaNG / v2rayNG: active VLESS and Trojan nodes only. */
export function generateSubscriptionBase64(configs: ProxyConfig[]): string {
  const uris = configs
    .filter(c => c.active && RUNTIME_PROTOCOLS.includes(c.protocol))
    .map(generateConfigUri)
    .filter(Boolean)
    .join('\n');
  return toBase64(uris);
}

/**
 * Per-user copies of the base configs: the user's UUID (VLESS) or Trojan password, and the real public host.
 * Each protocol only receives its own credential.
 */
export function generateUserPersonalizedConfigs(
  user: UserAccount,
  baseConfigs: ProxyConfig[],
  domainOverride?: string
): ProxyConfig[] {
  const swap = (value?: string) => (domainOverride && value && PLACEHOLDER_HOST.test(value) ? domainOverride : value);
  const allowed = user.allowedConfigs ?? ['all'];
  const allowAll = allowed.includes('all');

  return baseConfigs
    .filter(c => c.active && RUNTIME_PROTOCOLS.includes(c.protocol) && (allowAll || allowed.includes(c.id)))
    .map(c => {
      const server = swap(c.server) || c.server;
      return {
        ...c,
        server,
        host: swap(c.host) || server,
        sni: swap(c.sni) || server,
        // Trojan falls back to the subscription token for users created before trojanPassword existed (matches the server).
        ...(c.protocol === 'trojan'
          ? { password: user.trojanPassword || user.token || c.password }
          : { uuid: user.uuid || c.uuid }),
        remark: `${c.remark || c.name} [${user.username}]`,
      };
    });
}

// ==========================================
// Import
// ==========================================

/** Parse a vless:// or trojan:// link into a config (null when unsupported or malformed). */
export function parseConfigUri(uri: string): Partial<ProxyConfig> | null {
  try {
    const trimmed = uri.trim();
    const isVless = trimmed.startsWith('vless://');
    const isTrojan = trimmed.startsWith('trojan://');
    if (!isVless && !isTrojan) return null;

    const parsed = new URL(trimmed);
    const search = parsed.searchParams;
    const server = parsed.hostname.replace(/^\[|\]$/g, ''); // IPv6 comes back bracketed
    const remark = decodeURIComponent(parsed.hash.slice(1)) || (isVless ? 'Imported VLESS' : 'Imported Trojan');

    const common = {
      server,
      port: parseInt(parsed.port || '443', 10),
      transport: (search.get('type') as any) || 'ws',
      security: (search.get('security') as any) || 'tls',
      path: search.get('path') || '/',
      sni: search.get('sni') || server,
      host: search.get('host') || server,
      remark,
      name: remark,
      active: true,
    };

    if (isTrojan) {
      return { ...common, protocol: 'trojan', password: decodeURIComponent(parsed.username) };
    }

    // "fragment=len,interval,packets" or the three separate parameters
    const fragmentQuery = search.get('fragment');
    let [length, interval, packets] = [
      search.get('fragmentLength') || '10-50',
      search.get('fragmentInterval') || '20-50',
      search.get('fragmentPackets') || '1-3',
    ];
    if (fragmentQuery) {
      const parts = fragmentQuery.split(',');
      if (parts[0]) length = parts[0];
      if (parts[1]) interval = parts[1];
      if (parts[2]) packets = parts[2];
    }

    return {
      ...common,
      protocol: 'vless',
      uuid: parsed.username,
      flow: search.get('flow') || '',
      realityPublicKey: search.get('pbk') || '',
      realityShortId: search.get('sid') || '',
      spiderX: search.get('spx') || '',
      fragment: Boolean(fragmentQuery || search.get('fragmentLength')),
      fragmentLength: length,
      fragmentInterval: interval,
      fragmentPackets: packets,
    };
  } catch (err) {
    console.error('Failed to parse URI:', err);
    return null;
  }
}

// ==========================================
// Formatting
// ==========================================

/** 1536 -> "1.5 KB". Safe for 0, fractions, negatives and NaN. */
export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))));
  return `${parseFloat((bytes / k ** i).toFixed(Math.max(0, decimals)))} ${sizes[i]}`;
}
