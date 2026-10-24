import http from 'http';
import net from 'net';
import dns from 'dns';
import { WebSocket, WebSocketServer } from 'ws';
import type { UserAccount } from './types';
import { RateLimiter, getClientIp } from './Util';

// ==========================================
// Tunable parameters (env-overridable for A/B testing on Wasmer)
// ==========================================
const envNum = (name: string, def: number) => {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

const GB = 1024 ** 3;
// Larger socket buffers → fewer pause/resume cycles → lower latency
const HIGH_WATER_MARK       = envNum('PROXY_HWM',            256 * 1024);
const MAX_WS_BUFFERED       = envNum('PROXY_WS_BUFFERED',   512 * 1024);
const MAX_PENDING_BYTES     = envNum('PROXY_PENDING',       512 * 1024);
const MEM_RSS_LIMIT         = envNum('PROXY_MEM_RSS',       420 * 1024 * 1024);
const MEM_HEAP_LIMIT        = envNum('PROXY_MEM_HEAP',      350 * 1024 * 1024);
const CONNECT_TIMEOUT_MS    = envNum('PROXY_CONNECT_MS',    10_000);
const WS_PING_INTERVAL_MS   = envNum('PROXY_PING_MS',       30_000);
const TCP_KEEPALIVE_MS      = envNum('PROXY_KEEPALIVE_MS',  30_000);

const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_TARGETS === '1';
const VLESS_ACK = Buffer.from([0x00, 0x00]);

type Kind = 'vless' | 'trojan';

export interface ProxyContext {
  isReady(): boolean;
  findVlessUser(uuid: string): UserAccount | undefined;
  findTrojanUser(sha224Hex: string): UserAccount | undefined;
  recordUsage(user: UserAccount, up: number, down: number): void;
  touchUser(user: UserAccount): void;
}

// ==========================================
// Live stats
// ==========================================
export const stats = {
  liveConnections: 0,
  totalConnectionsServed: 0,
  sessionUploadBytes: 0,
  sessionDownloadBytes: 0,
  liveUploadSpeedBps: 0,
  liveDownloadSpeedBps: 0,
};

let upWindow = 0;
let downWindow = 0;
let memoryExhausted = false;

setInterval(() => {
  stats.liveUploadSpeedBps = Math.round(upWindow / 2);
  stats.liveDownloadSpeedBps = Math.round(downWindow / 2);
  upWindow = 0;
  downWindow = 0;
  const m = process.memoryUsage();
  memoryExhausted = m.rss > MEM_RSS_LIMIT || m.heapUsed > MEM_HEAP_LIMIT;
}, 2000).unref();

// ==========================================
// Probe limiter
// ==========================================
const probeLimiter = new RateLimiter(10, 60_000, true);
const dropped = { vless: 0, trojan: 0 };
let lastDropLog = 0;

function reportDropped(kind: Kind) {
  dropped[kind]++;
  const now = Date.now();
  if (now - lastDropLog > 60_000) {
    console.warn(`[proxy] Dropped unauthorized probes: vless=${dropped.vless}, trojan=${dropped.trojan}`);
    dropped.vless = 0;
    dropped.trojan = 0;
    lastDropLog = now;
  }
}

// ==========================================
// Private address guard
// ==========================================
function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return true;
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

const safeLookup: any = (hostname: string, options: any, cb: any) => {
  dns.lookup(hostname, options, (err: any, address: any, family: any) => {
    if (err) return cb(err);
    if (Array.isArray(address)) {
      const ok = address.filter((a: any) => !isPrivateAddress(a.address));
      return ok.length ? cb(null, ok) : cb(new Error('Blocked private address'));
    }
    return isPrivateAddress(address) ? cb(new Error('Blocked private address')) : cb(null, address, family);
  });
};

// ==========================================
// Header parsers
// ==========================================
type Parsed =
  | { ok: true; credential: string; command: number; host: string; port: number; payload: Buffer }
  | { ok: false; reason: string };

const fail = (reason: string): Parsed => ({ ok: false, reason });

type AddrType = 'ipv4' | 'domain' | 'ipv6';
const VLESS_ATYP: Record<number, AddrType> = { 1: 'ipv4', 2: 'domain', 3: 'ipv6' };
const TROJAN_ATYP: Record<number, AddrType> = { 1: 'ipv4', 3: 'domain', 4: 'ipv6' };

function readAddress(d: Buffer, p: number, type: AddrType): { host: string; next: number } | null {
  if (type === 'ipv4') {
    if (d.length < p + 4) return null;
    return { host: d.subarray(p, p + 4).join('.'), next: p + 4 };
  }
  if (type === 'domain') {
    if (d.length < p + 1) return null;
    const len = d[p];
    if (len === 0 || d.length < p + 1 + len) return null;
    return { host: d.toString('utf8', p + 1, p + 1 + len), next: p + 1 + len };
  }
  if (d.length < p + 16) return null;
  const parts: string[] = [];
  for (let i = 0; i < 16; i += 2) parts.push(d.readUInt16BE(p + i).toString(16));
  return { host: parts.join(':'), next: p + 16 };
}

function formatUuid(buf: Buffer): string {
  const h = buf.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function parseVless(d: Buffer): Parsed {
  if (d.length < 18) return fail('VLESS: packet too short');
  if (d[0] !== 0) return fail('VLESS: unsupported version');
  const credential = formatUuid(d.subarray(1, 17));
  const p = 18 + d[17];
  if (d.length < p + 4) return fail('VLESS: malformed header');
  const command = d[p];
  const port = d.readUInt16BE(p + 1);
  const type = VLESS_ATYP[d[p + 3]];
  if (!type) return fail('VLESS: unsupported address type');
  const addr = readAddress(d, p + 4, type);
  if (!addr) return fail('VLESS: malformed address');
  return { ok: true, credential, command, host: addr.host, port, payload: d.subarray(addr.next) };
}

function parseTrojan(d: Buffer): Parsed {
  if (d.length < 62) return fail('Trojan: packet too short');
  if (d[56] !== 0x0d || d[57] !== 0x0a) return fail('Trojan: bad header');
  const credential = d.toString('ascii', 0, 56);
  const command = d[58];
  const type = TROJAN_ATYP[d[59]];
  if (!type) return fail('Trojan: unsupported address type');
  const addr = readAddress(d, 60, type);
  if (!addr) return fail('Trojan: malformed address');
  if (d.length < addr.next + 4) return fail('Trojan: malformed header');
  const port = d.readUInt16BE(addr.next);
  return { ok: true, credential, command, host: addr.host, port, payload: d.subarray(addr.next + 4) };
}

export function accessDenied(user: UserAccount): string | null {
  if (!user.active) return 'User account suspended';
  if (Date.parse(user.expireAt) < Date.now()) return 'Subscription expired';
  if (user.usedUploadBytes + user.usedDownloadBytes >= user.quotaGB * GB) return 'Traffic quota exceeded';
  return null;
}

// ==========================================
// One relay for both protocols
// ==========================================
function handleConnection(ws: WebSocket, req: http.IncomingMessage, kind: Kind, ctx: ProxyContext) {
  const ip = getClientIp(req);
  const reject = (code: number, reason: string) => { try { ws.close(code, reason); } catch {} };

  if (probeLimiter.isLimited(ip)) return reject(4003, 'Rate limited');
  if (memoryExhausted || !ctx.isReady()) return reject(1013, 'Server busy or initializing');

  let state: 'auth' | 'connecting' | 'open' = 'auth';
  let user: UserAccount | null = null;
  let expiresAt = 0;
  let upstream: net.Socket | null = null;
  let connectTimer: NodeJS.Timeout | null = null;
  let keepaliveTimer: NodeJS.Timeout | null = null;
  let wsAlive = true;
  let counted = false;
  let closed = false;
  let pendingBytes = 0;
  const pending: Buffer[] = [];

  const clearTimers = () => {
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimers();
    if (counted) stats.liveConnections = Math.max(0, stats.liveConnections - 1);
    if (upstream && !upstream.destroyed) {
      try { upstream.end(); } catch {}
      // allow in-flight writes to flush briefly, then hard-destroy
      setTimeout(() => { try { upstream?.destroy(); } catch {} }, 100).unref();
    }
    upstream = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try { ws.close(1000, 'bye'); } catch {}
    }
  };

  // --- WebSocket keepalive: detects half-open connections NAT would otherwise drop silently ---
  ws.on('pong', () => { wsAlive = true; });
  keepaliveTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!wsAlive) {
      console.warn(`[${kind}] keepalive timeout for ${ip}`);
      return close();
    }
    wsAlive = false;
    try { ws.ping(); } catch { close(); }
  }, WS_PING_INTERVAL_MS);
  keepaliveTimer.unref();

  const account = (up: number, down: number) => {
    if (!user) return;
    stats.sessionUploadBytes += up;
    stats.sessionDownloadBytes += down;
    upWindow += up;
    downWindow += down;
    ctx.recordUsage(user, up, down);
    if (!user.active || Date.now() >= expiresAt ||
        user.usedUploadBytes + user.usedDownloadBytes >= user.quotaGB * GB) {
      close();
    }
  };

  // --- client → target ---
  const forward = (chunk: Buffer) => {
    if (closed || !upstream || upstream.destroyed) return;
    if (!upstream.write(chunk)) {
      // Backpressure: stop reading from the client until upstream drains.
      try { (ws as any).pause?.(); } catch (err) {
        console.warn(`[${kind}] ws.pause failed:`, (err as Error).message);
      }
    }
    account(chunk.length, 0);
  };

  // --- target → client (event-driven backpressure, NO polling) ---
  const onSendComplete = (err?: Error) => {
    if (err) return close();
    if (closed || !upstream) return;
    // Hysteresis: resume only after the client buffer has dropped below HWM/2
    if (upstream.isPaused() && ws.bufferedAmount < HIGH_WATER_MARK / 2 && !memoryExhausted) {
      upstream.resume();
    }
  };

  const onUpstreamData = (chunk: Buffer) => {
    if (closed || ws.readyState !== WebSocket.OPEN) return;
    if (memoryExhausted) return close();

    if (upstream && ws.bufferedAmount > MAX_WS_BUFFERED && !upstream.isPaused()) {
      upstream.pause();
    }

    ws.send(chunk, onSendComplete);
    account(0, chunk.length);
  };

  const connect = (host: string, port: number, payload: Buffer) => {
    if (!ALLOW_PRIVATE && net.isIP(host) && isPrivateAddress(host)) {
      return reject(1008, 'Target not allowed');
    }

    const sock = new net.Socket({
      readableHighWaterMark: HIGH_WATER_MARK,
      writableHighWaterMark: HIGH_WATER_MARK,
    } as any);
    upstream = sock;
    sock.setNoDelay(true);
    sock.setKeepAlive(true, TCP_KEEPALIVE_MS);   // NEW: detect dead peers

    sock.on('data', onUpstreamData);
    sock.on('drain', () => { try { (ws as any).resume?.(); } catch {} });
    sock.on('error', (err) => {
      if (!closed) console.warn(`[${kind}] upstream error: ${err.message}`);
      close();
    });
    sock.on('close', () => close());

    // NEW: prevent hung connections to unreachable targets
    connectTimer = setTimeout(() => {
      if (state === 'connecting') {
        console.warn(`[${kind}] connect timeout to ${host}:${port}`);
        close();
      }
    }, CONNECT_TIMEOUT_MS);
    connectTimer.unref();

    sock.connect({ host, port, lookup: ALLOW_PRIVATE ? undefined : safeLookup }, () => {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (closed) return;
      if (kind === 'vless') {
        try { ws.send(VLESS_ACK); } catch { return close(); }
      }
      state = 'open';
      if (payload.length) forward(payload);
      for (const chunk of pending.splice(0)) forward(chunk);
      pendingBytes = 0;
    });
  };

  const onFirstPacket = (data: Buffer) => {
    const parsed = kind === 'vless' ? parseVless(data) : parseTrojan(data);
    if (!parsed.ok) {
      probeLimiter.hit(ip);
      return reject(1002, parsed.reason || 'Bad request');
    }

    const found = kind === 'vless'
      ? ctx.findVlessUser(parsed.credential)
      : ctx.findTrojanUser(parsed.credential);

    if (!found) {
      probeLimiter.hit(ip);
      reportDropped(kind);
      return reject(4003, 'Unauthorized');
    }
    const denied = accessDenied(found);
    if (denied) return reject(4003, denied);
    if (parsed.command !== 1) return reject(1002, 'Only TCP is supported');

    user = found;
    expiresAt = Date.parse(found.expireAt);
    counted = true;
    stats.liveConnections++;
    stats.totalConnectionsServed++;
    ctx.touchUser(found);

    state = 'connecting';
    connect(parsed.host, parsed.port, parsed.payload);
  };

  ws.on('message', (raw: WebSocket.RawData) => {
    try {
      const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as any);
      if (state === 'open') return forward(data);
      if (state === 'connecting') {
        pendingBytes += data.length;
        if (pendingBytes > MAX_PENDING_BYTES) return close();
        pending.push(data);
        return;
      }
      onFirstPacket(data);
    } catch (err) {
      console.error(`[${kind}] connection error:`, (err as Error)?.message || err);
      close();
    }
  });

  ws.on('close', () => close());
  ws.on('error', (err) => {
    console.warn(`[${kind}] ws error: ${err.message}`);
    close();
  });
}

export function attachProxy(server: http.Server, ctx: ProxyContext): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024,
    perMessageDeflate: false,   // important: compression adds CPU and latency
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = (request.url || '').split('?')[0];
    const kind: Kind | null = pathname.startsWith('/vless') ? 'vless'
                             : pathname.startsWith('/trojan') ? 'trojan'
                             : null;
    if (!kind) return socket.destroy();
    wss.handleUpgrade(request, socket, head, ws => handleConnection(ws, request, kind, ctx));
  });

  return wss;
}
