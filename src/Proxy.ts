import http from 'http';
import net from 'net';
import dns from 'dns';
import { WebSocket, WebSocketServer } from 'ws';
import type { UserAccount } from './types';
import { RateLimiter, getClientIp } from './Util';

// ==========================================================================
// Tunables. Every one can be overridden from env; the defaults are conservative
// for a small container (Wasmer Edge). Several accept an older alias too.
// ==========================================================================
const num = (names: string | string[], fallback: number): number => {
  for (const name of Array.isArray(names) ? names : [names]) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') continue;
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return fallback;
};

const MB = 1024 * 1024;
const GB = 1024 ** 3;

// Buffers: small on purpose. Bigger buffers do not make browsing faster, they only add memory per
// connection and queueing delay; backpressure below keeps the pipe full without piling data up.
const HWM = num('PROXY_HWM', 64 * 1024);
const MAX_WS_BUFFERED = num('PROXY_WS_BUFFERED', 256 * 1024);       // pause the target when the client is this far behind
const WS_RESUME_BUFFERED = Math.floor(MAX_WS_BUFFERED / 2);          // ...and resume below half (hysteresis)
const MAX_PENDING_BYTES = num('PROXY_PENDING', 256 * 1024);          // data a client may send before the target is connected

// Memory: soft = stop taking new tunnels and stop reading from targets; hard = shed the heaviest tunnels.
const constrained = typeof (process as any).constrainedMemory === 'function' ? (process as any).constrainedMemory() : 0;
const MEM_BASE = constrained > 0 && constrained < 64 * GB ? constrained : 512 * MB;
const MEM_SOFT = num('PROXY_MEM_SOFT', Math.floor(MEM_BASE * 0.70));
const MEM_HARD = num(['PROXY_MEM_HARD', 'PROXY_MEM_RSS'], Math.floor(MEM_BASE * 0.90));

// Time limits (ms, 0 disables where it makes sense).
const AUTH_MS = num(['PROXY_AUTH_MS', 'AUTH_TIMEOUT_MS'], 10_000);        // header must arrive within this time
const CONNECT_MS = num(['PROXY_CONNECT_MS', 'CONNECT_TIMEOUT_MS'], 10_000); // DNS + TCP connect to the target
const IDLE_MS = num(['PROXY_IDLE_MS', 'IDLE_TIMEOUT_MS'], 300_000);       // no data either way
const PING_MS = num(['PROXY_PING_MS', 'WS_HEARTBEAT_MS'], 30_000);        // ping a tunnel that has been silent this long
const MAX_MISSED = num('PROXY_MISSED_PONGS', 3);                          // dead after PING_MS * (MAX_MISSED + 1) of no sign of life
const KEEPALIVE_MS = num('PROXY_KEEPALIVE_MS', 30_000);                   // TCP keepalive towards targets

// Limits.
const MAX_CONNECTIONS = num(['PROXY_MAX_CONNS', 'MAX_CONNECTIONS'], 500);               // 0 = unlimited
const MAX_CONN_PER_USER = num(['PROXY_MAX_CONNS_PER_USER', 'MAX_CONN_PER_USER'], 200);  // 0 = unlimited

// DNS.
const DNS_TTL_MS = num(['PROXY_DNS_TTL_MS', 'DNS_CACHE_TTL_MS'], 60_000);
const DNS_NEG_TTL_MS = num('PROXY_DNS_NEG_TTL_MS', 3_000);
const DNS_TIMEOUT_MS = num('PROXY_DNS_TIMEOUT_MS', 5_000);
const DNS_CACHE_MAX = 1000;
const PREFER_IPV6 = process.env.PROXY_PREFER_IPV6 === '1';

// UDP is served for DNS only: VLESS UDP framing is [len][packet], which is byte-for-byte DNS-over-TCP
// framing, so a plain TCP connection to the resolver carries it with no parsing.
const UDP_DNS_PORTS = new Set(
  (process.env.PROXY_UDP_DNS_PORTS || '53').split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0)
);

const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_TARGETS === '1';
const STRICT_PATHS = process.env.STRICT_PATHS === '1';
const VLESS_ACK = Buffer.from([0x00, 0x00]);

type Kind = 'vless' | 'trojan';

export interface ProxyContext {
  isReady(): boolean;
  findVlessUser(uuid: string): UserAccount | undefined;
  findTrojanUser(sha224Hex: string): UserAccount | undefined;
  /** Adds traffic to the user and global counters and marks the database dirty. */
  recordUsage(user: UserAccount, up: number, down: number): void;
  /** Called once per authenticated connection. */
  touchUser(user: UserAccount): void;
  /** Which protocol serves this WebSocket path (taken from the panel's configs). Optional. */
  kindForPath?(pathname: string): Kind | null;
}

// ==========================================================================
// Live stats (read by /api/stats) and diagnostics (one log line per minute)
// ==========================================================================
export const stats = {
  liveConnections: 0,
  totalConnectionsServed: 0,
  sessionUploadBytes: 0,
  sessionDownloadBytes: 0,
  liveUploadSpeedBps: 0,
  liveDownloadSpeedBps: 0,
  dnsTunnels: 0,
  upstreamErrors: 0,
  shed: 0,
  /** Since process start. Tells scanners, quota walls, unsupported clients and capacity problems apart. */
  rejected: { unauthorized: 0, malformed: 0, ratelimited: 0, limit: 0, busy: 0, blocked: 0, unsupported: 0 },
  timeouts: { auth: 0, connect: 0, idle: 0, dead: 0 },
};

let upWindow = 0;
let downWindow = 0;
let memLevel: 0 | 1 | 2 = 0;      // 0 ok, 1 soft limit, 2 hard limit
let rssBytes = 0;

// ==========================================================================
// Connection registry + ONE timer for everything time-based.
// (Per-connection timers re-armed on every chunk were a measurable CPU cost; a registry swept
// a few times per second costs nothing and cannot leak a timer.)
// ==========================================================================
interface Conn {
  sweep(now: number): void;
  onMemoryOk(): void;
  buffered(): number;
  close(): void;
}
const conns = new Set<Conn>();

const TICK_MS = Math.max(20, Math.min(2000, ...[AUTH_MS, CONNECT_MS, IDLE_MS, PING_MS].filter(t => t > 0).map(t => Math.floor(t / 3))));
let lastTick = Date.now();

function readRss(): number {
  const mu: any = process.memoryUsage;
  return typeof mu.rss === 'function' ? mu.rss() : process.memoryUsage().rss;
}

function updateMemoryLevel() {
  rssBytes = readRss();
  // Hysteresis: leave a level only when clearly below it, so the state does not flap.
  if (rssBytes > MEM_HARD) memLevel = 2;
  else if (memLevel === 2 && rssBytes > MEM_HARD * 0.9) memLevel = 2;
  else if (rssBytes > MEM_SOFT) memLevel = 1;
  else if (memLevel >= 1 && rssBytes > MEM_SOFT * 0.85) memLevel = 1;
  else memLevel = 0;
}

setInterval(() => {
  const now = Date.now();
  const dt = Math.max(0.001, (now - lastTick) / 1000);
  lastTick = now;
  stats.liveUploadSpeedBps = Math.round(upWindow / dt);
  stats.liveDownloadSpeedBps = Math.round(downWindow / dt);
  upWindow = 0;
  downWindow = 0;

  updateMemoryLevel();
  for (const c of conns) {
    c.sweep(now);
    if (memLevel === 0) c.onMemoryOk();
  }
  if (memLevel === 2) shedLoad();
}, TICK_MS).unref();

/** Hard memory limit: drop the tunnels holding the most buffered data instead of letting the whole process die. */
function shedLoad() {
  const heavy = [...conns].map(c => ({ c, b: c.buffered() })).filter(x => x.b > 0).sort((a, b) => b.b - a.b);
  const n = Math.max(1, Math.ceil(heavy.length * 0.1));
  for (const { c } of heavy.slice(0, n)) { stats.shed++; c.close(); }
}

let lastSummary = '';
setInterval(() => {
  const counters = JSON.stringify([stats.rejected, stats.timeouts, stats.dnsTunnels, stats.upstreamErrors, stats.shed]);
  const noteworthy = Object.values(stats.rejected).some(Boolean) || Object.values(stats.timeouts).some(Boolean) ||
    stats.upstreamErrors > 0 || stats.shed > 0;
  if (noteworthy && counters !== lastSummary) {
    lastSummary = counters;
    console.warn(
      `[proxy] live=${stats.liveConnections} served=${stats.totalConnectionsServed} rss=${Math.round(rssBytes / MB)}MB mem=${memLevel} ` +
      `dns=${stats.dnsTunnels} upErr=${stats.upstreamErrors} shed=${stats.shed} ` +
      `rejected=${JSON.stringify(stats.rejected)} timeouts=${JSON.stringify(stats.timeouts)}`
    );
  }
}, 60_000).unref();

// A shared IP (for example the edge proxy) must never lock real users out: the limiter only applies to
// callers that fail authentication (see onFirstPacket).
const probeLimiter = new RateLimiter(10, 60_000, true);
const userConnections = new Map<string, number>();

// ==========================================================================
// DNS: cached, de-duplicated, with a timeout; IPv4 first; private ranges filtered after resolution
// ==========================================================================
export function isPrivateAddress(ip: string): boolean {
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
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7)); // dotted IPv4-mapped form
  return /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

interface DnsEntry { addrs: dns.LookupAddress[]; err?: Error; expires: number }
const dnsCache = new Map<string, DnsEntry>();
const dnsInflight = new Map<string, Promise<dns.LookupAddress[]>>();

function cacheDns(key: string, entry: DnsEntry) {
  if (dnsCache.size >= DNS_CACHE_MAX) dnsCache.delete(dnsCache.keys().next().value as string);
  dnsCache.set(key, entry);
}

function resolveCached(hostname: string, family: number): Promise<dns.LookupAddress[]> {
  const key = `${hostname}|${family}`;
  const hit = dnsCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.err ? Promise.reject(hit.err) : Promise.resolve(hit.addrs);

  // Ten tabs asking for the same host cost one lookup, not ten (the libuv threadpool only has 4 threads).
  const running = dnsInflight.get(key);
  if (running) return running;

  const p = new Promise<dns.LookupAddress[]>((resolve, reject) => {
    let done = false;
    const finish = (err?: Error | null, addrs?: dns.LookupAddress[]) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      dnsInflight.delete(key);
      if (err) {
        if (DNS_NEG_TTL_MS > 0) cacheDns(key, { addrs: [], err, expires: Date.now() + DNS_NEG_TTL_MS });
        return reject(err);
      }
      if (DNS_TTL_MS > 0) cacheDns(key, { addrs: addrs!, expires: Date.now() + DNS_TTL_MS });
      resolve(addrs!);
    };
    const timer = setTimeout(() => finish(new Error('DNS timeout')), DNS_TIMEOUT_MS);
    dns.lookup(hostname, { all: true, family }, (err, addrs) => finish(err, addrs));
  });
  dnsInflight.set(key, p);
  return p;
}

/** IPv4 first: many hosting platforms have no IPv6 egress, and a dead AAAA attempt looks like a page that never opens. */
const orderAddresses = (list: dns.LookupAddress[]) =>
  PREFER_IPV6 ? list : [...list.filter(a => a.family === 4), ...list.filter(a => a.family !== 4)];

export const safeLookup: any = (hostname: string, options: any, cb: any) => {
  const wantAll = !!options?.all;
  resolveCached(hostname, options?.family || 0).then(
    addrs => {
      const allowed = orderAddresses(ALLOW_PRIVATE ? addrs : addrs.filter(a => !isPrivateAddress(a.address)));
      if (!allowed.length) return cb(new Error('Blocked private address'));
      return wantAll ? cb(null, allowed) : cb(null, allowed[0].address, allowed[0].family);
    },
    err => cb(err)
  );
};

// ==========================================================================
// Header parsers (pure, bounds-checked: a malformed packet must never throw)
// ==========================================================================
export type Parsed =
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

export function parseVless(d: Buffer): Parsed {
  if (d.length < 18) return fail('VLESS: packet too short');
  if (d[0] !== 0) return fail('VLESS: unsupported version');
  const credential = formatUuid(d.subarray(1, 17));
  const p = 18 + d[17]; // skip addons
  if (d.length < p + 4) return fail('VLESS: malformed header');
  const command = d[p]; // 1 = TCP, 2 = UDP, 3 = MUX
  const port = d.readUInt16BE(p + 1);
  const type = VLESS_ATYP[d[p + 3]];
  if (!type) return fail('VLESS: unsupported address type');
  const addr = readAddress(d, p + 4, type);
  if (!addr) return fail('VLESS: malformed address');
  return { ok: true, credential, command, host: addr.host, port, payload: d.subarray(addr.next) };
}

export function parseTrojan(d: Buffer): Parsed {
  if (d.length < 62) return fail('Trojan: packet too short');
  if (d[56] !== 0x0d || d[57] !== 0x0a) return fail('Trojan: bad header');
  const credential = d.toString('ascii', 0, 56);
  const command = d[58]; // 1 = CONNECT, 3 = UDP ASSOCIATE
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

// ==========================================================================
// One relay for both protocols
// ==========================================================================
const PAUSE_WS = 1;   // target paused because the client cannot keep up
const PAUSE_MEM = 2;  // target paused because the process is short of memory

export function handleConnection(ws: WebSocket, req: http.IncomingMessage, kind: Kind, ctx: ProxyContext) {
  const ip = getClientIp(req);
  const reject = (code: number, reason: string) => { try { ws.close(code, reason); } catch {} };

  if (memLevel >= 1 || !ctx.isReady()) {
    stats.rejected.busy++;
    return reject(1013, 'Server busy or initializing');
  }

  // 'connecting' exists so packets arriving before the target is connected are queued,
  // instead of being mistaken for a second handshake.
  let state: 'auth' | 'connecting' | 'open' = 'auth';
  let user: UserAccount | null = null;
  let countedUserId: string | null = null;
  let expiresAt = 0;
  let upstream: net.Socket | null = null;
  let udpTarget: { host: string; port: number } | null = null;  // set for a DNS-over-UDP tunnel
  let closed = false;
  let pendingBytes = 0;
  const pending: Buffer[] = [];

  const startedAt = Date.now();
  let stateSince = startedAt;
  let lastData = startedAt;    // last payload in either direction (idle detection)
  let lastAlive = startedAt;   // last sign the peer is there: message, pong, or our bytes accepted by its TCP (liveness)
  let lastPing = 0;
  let clientPaused = false;    // ws.pause(): we stopped reading the client because the target is slow
  let pausedBy = 0;            // reasons the target socket is paused (PAUSE_WS | PAUSE_MEM)

  const pauseUpstream = (flag: number) => {
    if (!upstream || (pausedBy & flag)) return;
    if (pausedBy === 0) upstream.pause();
    pausedBy |= flag;
  };
  const resumeUpstream = (flag: number) => {
    if (!(pausedBy & flag)) return;
    pausedBy &= ~flag;
    if (pausedBy === 0 && upstream && !upstream.destroyed) upstream.resume();
  };

  const close = () => {
    if (closed) return;
    closed = true;
    conns.delete(conn);
    if (countedUserId !== null) {
      stats.liveConnections = Math.max(0, stats.liveConnections - 1);
      const left = (userConnections.get(countedUserId) ?? 1) - 1;
      if (left <= 0) userConnections.delete(countedUserId);
      else userConnections.set(countedUserId, left);
      countedUserId = null;
    }

    // Always release the target socket. Waiting for the remote side to close its half leaves sockets
    // (and their buffers) behind for as long as the remote keeps them: the slow leak behind "everything
    // gets slow, then disconnects". Unsent bytes get a short grace period.
    const sock = upstream;
    upstream = null;
    if (sock && !sock.destroyed) {
      if (state === 'open' && sock.writableLength > 0) {
        try { sock.end(); } catch {}
        setTimeout(() => sock.destroy(), 2000).unref();
      } else {
        sock.destroy();
      }
    }

    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try { ws.close(1000); } catch {}
      setTimeout(() => { try { ws.terminate(); } catch {} }, 3000).unref(); // a vanished peer never completes the close handshake
    }
  };

  const kill = () => {
    try { ws.terminate(); } catch {}
    close();
  };

  // Accounting + quota enforcement on every chunk (a long-lived tunnel cannot outlive its quota).
  const account = (up: number, down: number) => {
    if (!user) return;
    stats.sessionUploadBytes += up;
    stats.sessionDownloadBytes += down;
    upWindow += up;
    downWindow += down;
    ctx.recordUsage(user, up, down);
    if (!user.active || Date.now() >= expiresAt || user.usedUploadBytes + user.usedDownloadBytes >= user.quotaGB * GB) {
      close();
    }
  };

  // ---- client -> target -------------------------------------------------
  const forward = (chunk: Buffer) => {
    if (closed) return;
    if (!upstream || upstream.destroyed) {
      if (udpTarget) reconnectDns(chunk); // the resolver closed an idle connection: reopen on demand
      return;
    }
    if (!upstream.write(chunk) && !clientPaused && typeof (ws as any).pause === 'function') {
      clientPaused = true;
      try { (ws as any).pause(); } catch { clientPaused = false; }
    }
    account(chunk.length, 0);
  };

  // The client is released as soon as the target drains. (It used to be released only if the *download* buffer
  // also happened to be small, which froze uploads whenever a download was running on the same tunnel.)
  const onDrain = () => {
    if (!clientPaused) return;
    clientPaused = false;
    try { (ws as any).resume?.(); } catch {}
  };

  // ---- target -> client (event driven, no polling) -----------------------
  const onSent = (err?: Error) => {
    if (err) return close();
    if (closed) return;
    lastAlive = Date.now(); // the peer's TCP is accepting our bytes, so it is there
    if ((pausedBy & PAUSE_WS) && ws.bufferedAmount <= WS_RESUME_BUFFERED) resumeUpstream(PAUSE_WS);
  };

  const onUpstreamData = (chunk: Buffer) => {
    if (closed || ws.readyState !== WebSocket.OPEN) return;
    lastData = Date.now();
    ws.send(chunk, onSent);
    account(0, chunk.length);
    if (ws.bufferedAmount > MAX_WS_BUFFERED) pauseUpstream(PAUSE_WS);
    if (memLevel >= 1) pauseUpstream(PAUSE_MEM); // under memory pressure stop reading; TCP flow control slows the sender
  };

  // ---- target connection ----------------------------------------------------
  const connect = (host: string, port: number, payload: Buffer, firstTime: boolean) => {
    if (!ALLOW_PRIVATE && net.isIP(host) && isPrivateAddress(host)) {
      stats.rejected.blocked++;
      return reject(1008, 'Target not allowed');
    }

    const sock = new net.Socket({ readableHighWaterMark: HWM, writableHighWaterMark: HWM } as any);
    upstream = sock;
    pausedBy = 0;
    let opened = false;
    sock.setNoDelay(true);
    sock.setKeepAlive(true, KEEPALIVE_MS);   // detect half-dead targets

    sock.on('data', onUpstreamData);
    sock.on('drain', onDrain);
    sock.on('error', err => {
      stats.upstreamErrors++;
      if (err?.message === 'Blocked private address') stats.rejected.blocked++;
    });
    sock.on('close', () => {
      if (sock !== upstream) return; // an old socket we already replaced or released
      if (udpTarget && opened && !closed && ws.readyState === WebSocket.OPEN) {
        upstream = null;               // DNS servers close idle TCP connections: keep the tunnel, reopen on the next query
        onDrain();
        return;
      }
      close();
    });

    // IPv4 first with fast fallback (happy eyeballs): a dead address family must not stall the connection.
    sock.connect({ host, port, lookup: safeLookup, autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 300 } as any, () => {
      if (closed || sock !== upstream) { sock.destroy(); return; }
      opened = true;
      state = 'open';
      lastData = lastAlive = Date.now();
      if (firstTime && kind === 'vless') {
        try { ws.send(VLESS_ACK); } catch { return close(); }
      }
      if (payload.length) forward(payload);
      for (const chunk of pending.splice(0)) forward(chunk);
      pendingBytes = 0;
    });
  };

  const reconnectDns = (first: Buffer) => {
    if (!udpTarget || closed) return;
    state = 'connecting';
    stateSince = Date.now();
    connect(udpTarget.host, udpTarget.port, first, false);
  };

  // ---- first packet: authenticate ------------------------------------------
  const onFirstPacket = (data: Buffer) => {
    const parsed = kind === 'vless' ? parseVless(data) : parseTrojan(data);
    if (!parsed.ok) {
      stats.rejected.malformed++;
      if (!probeLimiter.isLimited(ip)) probeLimiter.hit(ip);
      return reject(1002, parsed.reason);
    }

    const found = kind === 'vless' ? ctx.findVlessUser(parsed.credential) : ctx.findTrojanUser(parsed.credential);
    if (!found) {
      stats.rejected.unauthorized++;
      if (probeLimiter.isLimited(ip)) {
        stats.rejected.ratelimited++;
        return reject(4003, 'Rate limited');
      }
      probeLimiter.hit(ip);
      return reject(4003, 'Unauthorized');
    }

    const denied = accessDenied(found);
    if (denied) return reject(4003, denied);

    // Commands. VLESS UDP is accepted for DNS only (see UDP_DNS_PORTS).
    if (kind === 'vless' && parsed.command === 2) {
      if (!UDP_DNS_PORTS.has(parsed.port)) {
        stats.rejected.unsupported++;
        return reject(1002, 'UDP is only supported for DNS');
      }
      udpTarget = { host: parsed.host, port: parsed.port };
      stats.dnsTunnels++;
    } else if (parsed.command !== 1) {
      stats.rejected.unsupported++;
      return reject(1002, kind === 'vless' ? 'Mux is not supported: disable Mux in the client' : 'UDP is not supported over Trojan: use VLESS, or DoH/TCP DNS');
    }

    if (MAX_CONNECTIONS > 0 && stats.liveConnections >= MAX_CONNECTIONS) {
      stats.rejected.busy++;
      return reject(1013, 'Server at capacity');
    }
    const userCount = userConnections.get(found.id) ?? 0;
    if (MAX_CONN_PER_USER > 0 && userCount >= MAX_CONN_PER_USER) {
      stats.rejected.limit++;
      return reject(1013, 'Too many connections');
    }

    user = found;
    expiresAt = Date.parse(found.expireAt);
    countedUserId = found.id;
    userConnections.set(found.id, userCount + 1);
    stats.liveConnections++;
    stats.totalConnectionsServed++;
    ctx.touchUser(found);

    state = 'connecting';
    stateSince = Date.now();
    connect(parsed.host, parsed.port, parsed.payload, true);
  };

  // ---- registry hooks (called by the shared timer) ------------------------------
  const sweep = (now: number) => {
    if (closed) return;
    if (state === 'auth') {
      if (AUTH_MS > 0 && now - startedAt > AUTH_MS) { stats.timeouts.auth++; kill(); } // slowloris guard
      return;
    }
    if (state === 'connecting') {
      if (CONNECT_MS > 0 && now - stateSince > CONNECT_MS) { stats.timeouts.connect++; close(); }
      return;
    }
    if (IDLE_MS > 0 && now - lastData > IDLE_MS) { stats.timeouts.idle++; return close(); }

    // Safety net: never stay paused because a callback was missed.
    if ((pausedBy & PAUSE_WS) && ws.bufferedAmount <= WS_RESUME_BUFFERED) resumeUpstream(PAUSE_WS);

    // Liveness. Silence is only suspicious when WE are reading; while we have paused the client we cannot
    // see its pongs, and a tunnel that is moving data is obviously alive.
    if (clientPaused) lastAlive = now;
    if (PING_MS > 0) {
      const quiet = now - lastAlive;
      if (quiet > PING_MS * (MAX_MISSED + 1)) { stats.timeouts.dead++; return kill(); }
      if (quiet >= PING_MS && now - lastPing >= PING_MS) { // keeps NAT/edge mappings open on idle tunnels too
        lastPing = now;
        try { ws.ping(); } catch { close(); }
      }
    }
  };

  const conn: Conn = {
    sweep,
    onMemoryOk: () => resumeUpstream(PAUSE_MEM),
    buffered: () => ws.bufferedAmount + (upstream ? upstream.writableLength : 0),
    close,
  };
  conns.add(conn);

  ws.on('message', (raw: WebSocket.RawData) => {
    lastData = lastAlive = Date.now();
    try {
      const data = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
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
  ws.on('pong', () => { lastAlive = Date.now(); });
  ws.on('ping', () => { lastAlive = Date.now(); });
  ws.on('close', close);
  ws.on('error', close);
}

// ==========================================================================
// Public entry point
// ==========================================================================
const legacyKind = (pathname: string): Kind | null =>
  pathname.startsWith('/vless') ? 'vless' : pathname.startsWith('/trojan') ? 'trojan' : null;

export function attachProxy(server: http.Server, ctx: ProxyContext): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024,
    perMessageDeflate: false, // compression only adds CPU and latency here
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = (request.url || '').split('?')[0];
    // Paths come from the panel's configs first, so changing a path in the panel changes what the server accepts.
    // The old /vless* and /trojan* prefixes keep working unless STRICT_PATHS=1.
    const kind = ctx.kindForPath?.(pathname) ?? (STRICT_PATHS ? null : legacyKind(pathname));
    if (!kind) return socket.destroy();
    wss.handleUpgrade(request, socket, head, ws => handleConnection(ws, request, kind, ctx));
  });

  return wss;
}

// Enhanced proxy settings for better DPI bypass and stability
export const PROXY_ENHANCED = {
  // TCP optimizations
  TCP_NODELAY: true,
  TCP_KEEPALIVE: true,
  TCP_KEEPIDLE: 30,
  TCP_KEEPINTVL: 10,
  TCP_KEEPCNT: 3,
  
  // Buffer optimizations
  READ_BUFFER_SIZE: 64 * 1024,
  WRITE_BUFFER_SIZE: 64 * 1024,
  
  // Connection optimizations
  FAST_OPEN: true,
  REUSEADDR: true,
  
  // DPI bypass
  RANDOMIZE_PACKET_SIZES: process.env.PROXY_RANDOMIZE_PACKETS === '1',
  FAKE_HTTP_HEADERS: process.env.PROXY_FAKE_HEADERS === '1',
};
