import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import net from 'net';
import crypto from 'crypto';
import { ProxyConfig, UserAccount, CleanIpEntry, SystemStats } from './src/types';
import {
  generateSubscriptionBase64,
  generateConfigUri,
  generateUserPersonalizedConfigs
} from './src/utils/configParsers';
import {
  PersistentStorageSchema,
  PersistenceAdapter,
  JsonFilePersistenceAdapter,
  PostgresPersistenceAdapter,
  SeedOptions,
  createSeedData
} from './src/db/persistence';
import { attachProxy, stats as proxyStats } from './src/server/proxy';
import { getClientIp, RateLimiter } from './src/server/util';
import { hashToken, hashPasswordScrypt, verifyPassword } from './src/server/auth';

// ==========================================
// 0. CONFIG
// ==========================================
const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const GB = 1024 ** 3;
const SESSION_TTL_MS = 24 * 3600 * 1000;

// Public hostname used in subscription links, e.g. "myapp.wasmer.app"
const PUBLIC_HOST = (process.env.PUBLIC_HOST || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

function fatal(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

// The secret MUST be stable across restarts: seed UUIDs/tokens and legacy password hashes derive from it.
function getSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  if (IS_PROD) fatal('SESSION_SECRET (min 16 chars) is required in production. Set it once and never change it.');

  // Development only: persist a local secret so dev data survives restarts.
  const secretFile = path.join(DATA_DIR, '.session_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const saved = fs.readFileSync(secretFile, 'utf-8').trim();
      if (saved.length >= 16) return saved;
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, generated, 'utf-8');
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const SESSION_SECRET = getSessionSecret();

// Legacy hash: kept for old databases (upgraded to scrypt on first successful login) and for tests.
export function hashPassword(pass: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(pass).digest('hex');
}

const INITIAL_ADMIN_USER = process.env.ADMIN_USER || 'admin';
const INITIAL_ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const INITIAL_ADMIN_HASH = hashPassword(INITIAL_ADMIN_PASS);

if (IS_PROD && (!process.env.ADMIN_PASS || INITIAL_ADMIN_PASS === 'admin123')) {
  fatal('ADMIN_PASS must be set to a strong value in production.');
}

const seedOptions: SeedOptions = {
  adminUsername: INITIAL_ADMIN_USER,
  adminPasswordHash: INITIAL_ADMIN_HASH,
  secret: SESSION_SECRET,
  publicHost: PUBLIC_HOST || 'localhost',
};

const app = express();
const server = http.createServer(app);
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

// ==========================================
// 1. DATABASE
// ==========================================
let persistence: PersistenceAdapter;
const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (postgresUrl && /^postgres(ql)?:\/\//.test(postgresUrl)) {
  console.log('🐘 Using PostgreSQL persistence');
  persistence = new PostgresPersistenceAdapter(postgresUrl, seedOptions);
} else {
  if (IS_PROD) console.warn('⚠️ DATABASE_URL not set: JSON storage is NOT durable on Wasmer. Data and links will be lost on reset.');
  console.log('📁 Using JSON file persistence in:', DATA_DIR);
  persistence = new JsonFilePersistenceAdapter(DATA_DIR, seedOptions);
}

let db: PersistentStorageSchema = createSeedData(seedOptions);
let isDatabaseReady = false;
let isDbDirty = false;
let isShuttingDown = false;

export function markDatabaseDirty() {
  isDbDirty = true;
}

export async function flushDatabaseToDisk(force = false): Promise<boolean> {
  if (!persistence.isReady()) return false;
  if (!isDbDirty && !force) return true;
  try {
    const ok = await persistence.save(db, force);
    if (ok) isDbDirty = false;
    return ok;
  } catch (err: any) {
    console.error('❌ Error flushing database:', err?.message || err);
    return false;
  }
}

export async function initializeDatabase(): Promise<void> {
  try {
    await persistence.init();
    db = await persistence.load();
    isDatabaseReady = true;
    isDbDirty = false;

    // Recovery switch: ADMIN_RESET=1 re-applies ADMIN_USER/ADMIN_PASS for one boot (then remove it).
    if (process.env.ADMIN_RESET === '1') {
      db.adminUsername = INITIAL_ADMIN_USER;
      db.adminPasswordHash = await hashPasswordScrypt(INITIAL_ADMIN_PASS);
      db.sessions = {};
      isDbDirty = true;
      await flushDatabaseToDisk(true);
      console.warn('🔑 ADMIN_RESET=1: admin credentials were reset from env. Remove ADMIN_RESET now.');
    }

    console.log(`✅ Database ready: ${db.configs.length} configs, ${db.users.length} users.`);
  } catch (err: any) {
    console.error('❌ Failed to initialize database:', err?.message || err);
    isDatabaseReady = false; // /readyz reports it; don't crash the process
  }
}

setInterval(() => {
  if (isDbDirty && isDatabaseReady) flushDatabaseToDisk();
}, 30_000).unref();

// ==========================================
// 2. PROXY ENGINE (VLESS / Trojan over WebSocket)
// ==========================================
const hashCache = new Map<string, string>();
function sha224Hex(secret: string): string {
  let h = hashCache.get(secret);
  if (!h) {
    h = crypto.createHash('sha224').update(secret).digest('hex');
    if (hashCache.size > 5000) hashCache.clear();
    hashCache.set(secret, h);
  }
  return h;
}

// Trojan secret falls back to the subscription token for users created before trojanPassword existed.
const trojanSecret = (u: UserAccount) => u.trojanPassword || u.token;

const wss = attachProxy(server, {
  isReady: () => isDatabaseReady,
  findVlessUser: uuid => {
    const target = uuid.toLowerCase();
    return db.users.find(u => u.uuid?.toLowerCase() === target);
  },
  findTrojanUser: hex => {
    const target = hex.toLowerCase();
    return db.users.find(u => sha224Hex(trojanSecret(u)) === target);
  },
  recordUsage: (user, up, down) => {
    user.usedUploadBytes += up;
    user.usedDownloadBytes += down;
    db.lifetimeUploadBytes = (db.lifetimeUploadBytes || 0) + up;
    db.lifetimeDownloadBytes = (db.lifetimeDownloadBytes || 0) + down;
    isDbDirty = true;
  },
  touchUser: user => {
    user.lastConnectedAt = new Date().toISOString();
    isDbDirty = true;
  },
});

// ==========================================
// 3. HEALTH
// ==========================================
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.get('/readyz', (_req, res) => {
  const info = persistence.getStats();
  if (isDatabaseReady && persistence.isReady()) {
    return res.status(200).json({ status: 'ready', database: { type: info.type, connected: true } });
  }
  return res.status(503).json({
    status: 'unavailable',
    database: { type: info.type, connected: false },
    message: 'Database is initializing or temporarily unavailable.'
  });
});

// ==========================================
// 4. ADMIN AUTH
// ==========================================
const loginLimiter = new RateLimiter(5, 60_000);

function getSession(req: express.Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const key = hashToken(header.slice(7));
  const session = db.sessions?.[key];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    delete db.sessions[key];
    markDatabaseDirty();
    return null;
  }
  return { key, session };
}

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const found = getSession(req);
  if (!found) return res.status(401).json({ success: false, error: 'Authentication required' });

  // Sliding expiry, but only write when it matters (saves a DB write on every API call).
  if (found.session.expiresAt - Date.now() < SESSION_TTL_MS / 2) {
    found.session.expiresAt = Date.now() + SESSION_TTL_MS;
    markDatabaseDirty();
  }
  next();
}

app.post('/api/auth/login', async (req, res) => {
  const ip = getClientIp(req);
  if (loginLimiter.isLimited(ip)) {
    return res.status(429).json({ success: false, message: 'Too many login attempts. Please wait 1 minute.' });
  }

  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  const adminUser = db.adminUsername || INITIAL_ADMIN_USER;
  const stored = db.adminPasswordHash || INITIAL_ADMIN_HASH;
  // Always verify, even on username mismatch, so timing doesn't reveal the username.
  const { ok, needsUpgrade } = await verifyPassword(password, stored, hashPassword);

  if (username.trim() !== adminUser || !ok) {
    loginLimiter.hit(ip);
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }
  loginLimiter.clear(ip);

  if (needsUpgrade) db.adminPasswordHash = await hashPasswordScrypt(password);

  const token = `adm_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  if (!db.sessions) db.sessions = {};
  db.sessions[hashToken(token)] = { username: adminUser, expiresAt };
  markDatabaseDirty();
  await flushDatabaseToDisk();

  res.json({ success: true, token, username: adminUser, expiresAt: new Date(expiresAt).toISOString() });
});

app.post('/api/auth/logout', (req, res) => {
  const found = getSession(req);
  if (found) {
    delete db.sessions[found.key];
    markDatabaseDirty();
  }
  res.json({ success: true, message: 'Logged out' });
});

app.get('/api/auth/me', (req, res) => {
  const found = getSession(req);
  res.json(found ? { authenticated: true, username: found.session.username } : { authenticated: false });
});

app.post('/api/auth/change-password', requireAdminAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body ?? {};
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  const stored = db.adminPasswordHash || INITIAL_ADMIN_HASH;
  const { ok } = await verifyPassword(typeof oldPassword === 'string' ? oldPassword : '', stored, hashPassword);
  if (!ok) return res.status(400).json({ success: false, message: 'Old password is incorrect' });

  db.adminPasswordHash = await hashPasswordScrypt(newPassword);
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true, message: 'Password changed and permanently persisted' });
});

// ==========================================
// 5. SUBSCRIPTION (MahsaNG / v2rayNG)
// ==========================================
app.get('/sub/:token', (req, res) => {
  const user = db.users.find(u => u.token === req.params.token);
  if (!user) return res.status(404).send('Subscription not found. Invalid Token.');
  if (!user.active) return res.status(403).send('Account suspended.');

  const maxBytes = user.quotaGB * GB;
  const expired = Date.parse(user.expireAt) < Date.now();
  const exceeded = user.usedUploadBytes + user.usedDownloadBytes >= maxBytes;

  res.setHeader(
    'Subscription-Userinfo',
    `upload=${user.usedUploadBytes}; download=${user.usedDownloadBytes}; total=${maxBytes}; expire=${Math.floor(Date.parse(user.expireAt) / 1000)}`
  );
  res.setHeader('Profile-Update-Interval', '6');
  res.setHeader('Profile-Title', `Shirin-RayPanel: ${user.username}`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (expired || exceeded) {
    const msg = expired ? '⚠️ Subscription Expired' : '⚠️ Data Quota Exceeded';
    const alertConfig: ProxyConfig = {
      id: 'alert-expired-node',
      name: msg,
      protocol: 'vless',
      uuid: '00000000-0000-0000-0000-000000000000', // display-only node: it only needs to show the message in the client
      server: '127.0.0.1',
      port: 443,
      transport: 'ws',
      security: 'none',
      remark: msg,
      active: true,
      createdAt: new Date().toISOString()
    };
    return res.send(generateSubscriptionBase64([alertConfig]));
  }

  // PUBLIC_HOST makes links independent of whichever Host header the request arrived with.
  const host = PUBLIC_HOST || (req.headers.host || '').split(':')[0];
  const configs = generateUserPersonalizedConfigs(user, db.configs, host);

  if (req.query.format === 'raw') return res.send(configs.map(generateConfigUri).filter(Boolean).join('\n'));
  res.send(generateSubscriptionBase64(configs));
});

// ==========================================
// 6. ADMIN APIS
// ==========================================
const pick = (src: any, keys: readonly string[]) => {
  const out: Record<string, any> = {};
  for (const k of keys) if (src && src[k] !== undefined) out[k] = src[k];
  return out;
};

const CONFIG_FIELDS = [
  'name', 'protocol', 'server', 'port', 'uuid', 'password', 'username', 'transport', 'path', 'host', 'sni',
  'security', 'alpn', 'flow', 'realityPublicKey', 'realityShortId', 'spiderX', 'remark', 'operatorPreset',
  'cleanIp', 'useCleanIp', 'fragment', 'fragmentLength', 'fragmentInterval', 'fragmentPackets', 'active'
] as const;

const USER_FIELDS = [
  'username', 'email', 'token', 'uuid', 'trojanPassword', 'quotaGB', 'usedUploadBytes', 'usedDownloadBytes',
  'expireAt', 'active', 'allowedConfigs', 'notes'
] as const;

const CLEAN_IP_FIELDS = ['ip', 'operator', 'name', 'ispNameFa', 'pingMs', 'active', 'notes'] as const;

const newId = (prefix: string, given: unknown) =>
  typeof given === 'string' && given ? given : `${prefix}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

/** list / create / update / delete for one collection. Updates mutate in place and only accept whitelisted fields. */
function registerCrud<T extends { id: string }>(o: {
  route: string;
  label: string;
  listKey: string;
  itemKey: string;
  list: () => T[];
  replace: (items: T[]) => void;
  fields: readonly string[];
  build: (body: any) => T;
  normalize?: (patch: Record<string, any>) => Record<string, any>;
  conflict?: (candidate: T, self?: T) => string | null;
  onDelete?: (item: T) => void;
}) {
  app.get(o.route, requireAdminAuth, (_req, res) => {
    res.json({ [o.listKey]: o.list() });
  });

  app.post(o.route, requireAdminAuth, async (req, res) => {
    const item = o.build(req.body ?? {});
    if (o.list().some(x => x.id === item.id)) {
      return res.status(409).json({ success: false, error: `${o.label} id already exists` });
    }
    const conflict = o.conflict?.(item);
    if (conflict) return res.status(409).json({ success: false, error: conflict });

    o.list().unshift(item);
    markDatabaseDirty();
    await flushDatabaseToDisk(true);
    res.json({ success: true, [o.itemKey]: item });
  });

  app.put(`${o.route}/:id`, requireAdminAuth, async (req, res) => {
    const item = o.list().find(x => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: `${o.label} not found` });

    let patch = pick(req.body, o.fields);
    if (o.normalize) patch = o.normalize(patch);
    const conflict = o.conflict?.({ ...item, ...patch }, item);
    if (conflict) return res.status(409).json({ success: false, error: conflict });

    // In place: live proxy connections keep a valid reference to the user object.
    Object.assign(item, patch);
    markDatabaseDirty();
    await flushDatabaseToDisk(true);
    res.json({ success: true, [o.itemKey]: item });
  });

  app.delete(`${o.route}/:id`, requireAdminAuth, async (req, res) => {
    const item = o.list().find(x => x.id === req.params.id);
    if (item) o.onDelete?.(item);
    o.replace(o.list().filter(x => x.id !== req.params.id));
    markDatabaseDirty();
    await flushDatabaseToDisk(true);
    res.json({ success: true });
  });
}

registerCrud<ProxyConfig>({
  route: '/api/configs',
  label: 'Config',
  listKey: 'configs',
  itemKey: 'config',
  list: () => db.configs,
  replace: items => { db.configs = items; },
  fields: CONFIG_FIELDS,
  build: b => ({
    ...pick(b, CONFIG_FIELDS),
    id: newId('cfg', b.id),
    active: b.active ?? true,
    createdAt: new Date().toISOString(),
  }) as ProxyConfig,
});

const normalizeUserPatch = (p: Record<string, any>) => {
  if (p.quotaGB !== undefined) p.quotaGB = Number(p.quotaGB) || 0;
  return p;
};

registerCrud<UserAccount>({
  route: '/api/users',
  label: 'User',
  listKey: 'users',
  itemKey: 'user',
  list: () => db.users,
  replace: items => { db.users = items; },
  fields: USER_FIELDS,
  normalize: normalizeUserPatch,
  build: b => ({
    ...pick(b, USER_FIELDS),
    id: newId('usr', b.id),
    token: b.token || `sub_${crypto.randomBytes(8).toString('hex')}`,
    uuid: b.uuid || crypto.randomUUID(),
    trojanPassword: b.trojanPassword || `Pass_${crypto.randomBytes(6).toString('hex')}`,
    quotaGB: Number(b.quotaGB) || 30,
    usedUploadBytes: Number(b.usedUploadBytes) || 0,
    usedDownloadBytes: Number(b.usedDownloadBytes) || 0,
    expireAt: b.expireAt || new Date(Date.now() + 30 * 86400000).toISOString(),
    active: b.active ?? true,
    allowedConfigs: Array.isArray(b.allowedConfigs) ? b.allowedConfigs : ['all'],
    createdAt: new Date().toISOString(),
  }) as UserAccount,
  // Duplicates would make every Postgres save fail (UNIQUE username/token) and silently stop persistence.
  conflict: (c, self) =>
    db.users.some(u => u !== self && (u.username === c.username || u.token === c.token || (!!c.uuid && u.uuid === c.uuid)))
      ? 'Username, token or UUID already exists'
      : null,
  // Live connections hold this object: deactivating it makes the relay drop them.
  onDelete: u => { u.active = false; },
});

registerCrud<CleanIpEntry>({
  route: '/api/clean-ips',
  label: 'IP',
  listKey: 'cleanIps',
  itemKey: 'cleanIp',
  list: () => db.cleanIps,
  replace: items => { db.cleanIps = items; },
  fields: CLEAN_IP_FIELDS,
  build: b => ({
    ...pick(b, CLEAN_IP_FIELDS),
    id: newId('cip', b.id),
    active: b.active ?? true,
    addedAt: new Date().toISOString(),
  }) as CleanIpEntry,
});

app.post('/api/users/:id/reset-traffic', requireAdminAuth, async (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.usedUploadBytes = 0;
  user.usedDownloadBytes = 0;
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true, user });
});

app.post('/api/clean-ips/:id/ping', requireAdminAuth, (req, res) => {
  const entry = db.cleanIps.find(ip => ip.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Clean IP not found' });

  const start = Date.now();
  const sock = new net.Socket();
  let done = false;

  // error + timeout can both fire; answer exactly once.
  const finish = (pingMs: number | null, error?: string) => {
    if (done) return;
    done = true;
    sock.destroy();
    if (pingMs === null) return res.json({ success: false, pingMs: null, error });
    entry.pingMs = pingMs;
    markDatabaseDirty();
    res.json({ success: true, pingMs });
  };

  sock.setTimeout(2500);
  sock.once('connect', () => finish(Date.now() - start));
  sock.once('timeout', () => finish(null, 'Connection timed out'));
  sock.once('error', () => finish(null, 'Connection failed'));
  sock.connect(443, entry.ip);
});

app.get('/api/stats', requireAdminAuth, (_req, res) => {
  const totalQuotaBytes = db.users.reduce((acc, u) => acc + u.quotaGB * GB, 0);
  const usedBytes = db.users.reduce((acc, u) => acc + u.usedUploadBytes + u.usedDownloadBytes, 0);
  const lifetimeUp = db.lifetimeUploadBytes || 0;
  const lifetimeDown = db.lifetimeDownloadBytes || 0;
  const sessionMB = Math.round(((proxyStats.sessionUploadBytes + proxyStats.sessionDownloadBytes) / (1024 * 1024)) * 10) / 10;

  const stats: SystemStats = {
    totalConfigs: db.configs.length,
    activeConfigs: db.configs.filter(c => c.active).length,
    totalUsers: db.users.length,
    activeUsers: db.users.filter(u => u.active).length,
    totalTrafficGB: Math.round((totalQuotaBytes / GB) * 10) / 10,
    usedTrafficGB: Math.round((usedBytes / GB) * 100) / 100,
    todayTrafficMB: sessionMB,
    sessionTrafficMB: sessionMB,
    lifetimeTrafficGB: Math.round(((lifetimeUp + lifetimeDown) / GB) * 100) / 100,
    lifetimeUploadBytes: lifetimeUp,
    lifetimeDownloadBytes: lifetimeDown,
    sessionUploadBytes: proxyStats.sessionUploadBytes,
    sessionDownloadBytes: proxyStats.sessionDownloadBytes,
    liveConnections: proxyStats.liveConnections,
    totalConnectionsServed: proxyStats.totalConnectionsServed,
    liveUploadSpeedBps: proxyStats.liveUploadSpeedBps,
    liveDownloadSpeedBps: proxyStats.liveDownloadSpeedBps,
    totalUploadBytes: lifetimeUp || proxyStats.sessionUploadBytes,
    totalDownloadBytes: lifetimeDown || proxyStats.sessionDownloadBytes,
  };
  res.json({ stats });
});

// --- Backup / restore ---
app.get('/api/database/export', requireAdminAuth, (_req, res) => {
  const safeExport = { ...db, adminPasswordHash: undefined, sessions: undefined };
  res.setHeader('Content-Disposition', `attachment; filename=shirin-database-${new Date().toISOString().slice(0, 10)}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(safeExport, null, 2));
});

app.post('/api/database/import', requireAdminAuth, async (req, res) => {
  const imp = req.body;
  const hasIds = (a: unknown) => Array.isArray(a) && a.every(x => x && typeof x.id === 'string');

  if (!imp || !hasIds(imp.configs) || !hasIds(imp.users)) {
    return res.status(400).json({ success: false, message: 'Invalid database schema' });
  }
  const users: UserAccount[] = imp.users;
  const unique = (vals: (string | undefined)[]) => new Set(vals).size === vals.length;
  if (!unique(users.map(u => u.username)) || !unique(users.map(u => u.token))) {
    return res.status(400).json({ success: false, message: 'Duplicate username or token in import' });
  }

  db.configs = imp.configs;
  db.users = users;
  if (Array.isArray(imp.cleanIps)) db.cleanIps = imp.cleanIps;
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true, message: 'Database imported successfully' });
});

// ==========================================
// 7. FRONTEND
// ==========================================
// Never expose server bundles, sourcemaps, dotfiles or database files.
const BLOCKED_PATH = /(^\/server\/|\.cjs$|\.map$|\.ts$|\/\.(?!well-known)|database(\.bak)?\.json)/i;

export async function startServer() {
  await initializeDatabase();

  app.use((req, res, next) => (BLOCKED_PATH.test(req.path) ? res.status(403).json({ error: 'Access forbidden' }) : next()));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const clientDist = path.join(process.cwd(), 'dist', 'client');
    const staticDir = fs.existsSync(clientDist) ? clientDist : path.join(process.cwd(), 'dist');

    app.use(express.static(staticDir, { index: false, dotfiles: 'ignore' }));
    app.get('*', (_req, res) => {
      const indexPath = path.join(staticDir, 'index.html');
      if (fs.existsSync(indexPath)) res.sendFile(indexPath);
      else res.status(404).send('Frontend bundle not built yet.');
    });
  }

  // JSON instead of an HTML stack page for bad bodies etc.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    if (status >= 500) console.error('Unhandled request error:', err?.message || err);
    res.status(status).json({ success: false, error: status >= 500 ? 'Internal server error' : 'Bad request' });
  });

  server.on('clientError', (_err, socket: net.Socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error('Server error:', err.message);
    if (err.code === 'EADDRINUSE') process.exit(1);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Shirin server on http://0.0.0.0:${PORT}`);
    console.log(`📡 VLESS: /vless-ws   Trojan: /trojan-ws`);
    if (PUBLIC_HOST) console.log(`🌐 Public host: ${PUBLIC_HOST}`);
    else console.warn('⚠️ PUBLIC_HOST not set: subscription links use the request Host header.');
  });
}

// ==========================================
// 8. SHUTDOWN
// ==========================================
export async function handleGracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 ${signal}: shutting down...`);

  try {
    await flushDatabaseToDisk(true);
    console.log('💾 Database flushed.');
  } catch (e) {
    console.error('Failed to flush database during shutdown:', e);
  }

  try {
    wss.clients.forEach(c => { try { c.close(1001, 'Server shutting down'); } catch {} });
    wss.close();
  } catch {}

  try { await persistence.close(); } catch {}

  server.close(() => {
    console.log('👋 Closed. Bye.');
    process.exit(0);
  });

  setTimeout(() => {
    console.warn('⚠️ Force exit after timeout.');
    process.exit(0);
  }, 4000);
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
  // Safety net: one bad packet must not take the whole proxy down.
  process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));
  process.on('uncaughtException', err => console.error('Uncaught exception:', err));
  startServer();
}

export { app, server, db, wss, persistence };
