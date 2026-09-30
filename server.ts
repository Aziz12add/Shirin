import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import net from 'net';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { 
  ProxyConfig, 
  UserAccount, 
  CleanIpEntry, 
  TrafficRecord, 
  DatabaseSettings,
  SystemStats 
} from './src/types';
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
  defaultInitialCleanIps,
  createSeedData
} from './src/db/persistence';

const app = express();
const server = http.createServer(app);

// Dynamic Port (Wasmer: 8080 or custom, Railway: PORT, Local: 3000)
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Security & Secret key management
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Fixed or durable session secret: never generate random volatile secret on each restart in production
function getOrInitDurableSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }
  const secretFile = path.join(DATA_DIR, '.session_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const saved = fs.readFileSync(secretFile, 'utf-8').trim();
      if (saved.length >= 16) return saved;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, generated, 'utf-8');
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ WARNING: SESSION_SECRET env var not set. Generated durable secret at data/.session_secret');
    }
    return generated;
  } catch (e) {
    return 'shirin_durable_fallback_secret_key_prod_2026';
  }
}

const SESSION_SECRET = getOrInitDurableSecret();

// Password hashing with HMAC-SHA256
export function hashPassword(pass: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(pass).digest('hex');
}

// Initial Admin Credentials (only used if database doesn't already have an admin password)
const INITIAL_ADMIN_USER = process.env.ADMIN_USER || 'admin';
const INITIAL_ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const INITIAL_ADMIN_HASH = hashPassword(INITIAL_ADMIN_PASS);

if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_PASS || process.env.ADMIN_PASS === 'admin123')) {
  console.warn('⚠️ SECURITY WARNING: ADMIN_PASS is using default value in production. Please set a strong ADMIN_PASS.');
}

// Login Rate Limiter (Max 5 attempts per 60s per IP)
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (now - entry.firstAttempt > 60000) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= 5;
}
function recordLoginFailure(ip: string) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAttempt > 60000) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    entry.count++;
  }
}
function clearLoginAttempts(ip: string) {
  loginAttempts.delete(ip);
}

app.use(express.json({ limit: '5mb' }));

// ==========================================
// 1. DATABASE & PERSISTENCE ADAPTER SELECTION
// ==========================================
let persistence: PersistenceAdapter;
const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (postgresUrl && (postgresUrl.startsWith('postgres://') || postgresUrl.startsWith('postgresql://'))) {
  console.log('🐘 Initializing PostgreSQL managed persistence adapter...');
  persistence = new PostgresPersistenceAdapter(postgresUrl, INITIAL_ADMIN_USER, INITIAL_ADMIN_HASH);
} else {
  console.log('📁 Initializing Atomic JSON file persistence adapter in:', DATA_DIR);
  persistence = new JsonFilePersistenceAdapter(DATA_DIR, INITIAL_ADMIN_USER, INITIAL_ADMIN_HASH);
}

// In-Memory Synchronized State (Always backed by persistence)
let db: PersistentStorageSchema = createSeedData(INITIAL_ADMIN_USER, INITIAL_ADMIN_HASH);

// Process state tracking
let isDatabaseReady = false;
let isDbDirty = false;
let isShuttingDown = false;

export function markDatabaseDirty() {
  isDbDirty = true;
}

// Initialize database
export async function initializeDatabase(): Promise<void> {
  try {
    await persistence.init();
    db = await persistence.load();
    isDatabaseReady = true;
    isDbDirty = false;
    console.log(`✅ Database ready. Loaded ${db.configs.length} configs and ${db.users.length} users.`);
  } catch (err: any) {
    console.error('❌ Failed to initialize database:', err?.message || err);
    // Do not crash startup so readiness probe can communicate state clearly
    isDatabaseReady = false;
  }
}

// Sync database state to durable storage
export async function flushDatabaseToDisk(force = false): Promise<boolean> {
  if (!persistence.isReady()) return false;
  if (!isDbDirty && !force) return true;

  try {
    const success = await persistence.save(db, force);
    if (success) {
      isDbDirty = false;
    }
    return success;
  } catch (err: any) {
    console.error('❌ Error flushing database:', err?.message || err);
    return false;
  }
}

// Periodic flush every 30 seconds if dirty
setInterval(() => {
  if (isDbDirty && isDatabaseReady) {
    flushDatabaseToDisk();
  }
}, 30 * 1000);

// ==========================================
// 2. EMBEDDED REAL PROXY SERVER ENGINE
// ==========================================
let liveConnectionsCount = 0;
let totalConnectionsServed = 0;
let sessionUploadBytes = 0;
let sessionDownloadBytes = 0;

// Speed meters (bytes transferred in the last 2 seconds)
let uploadBytesWindow = 0;
let downloadBytesWindow = 0;
let liveUploadSpeedBps = 0;
let liveDownloadSpeedBps = 0;

setInterval(() => {
  liveUploadSpeedBps = Math.round(uploadBytesWindow / 2);
  liveDownloadSpeedBps = Math.round(downloadBytesWindow / 2);
  uploadBytesWindow = 0;
  downloadBytesWindow = 0;
}, 2000);

// UUID string formatting helper
function formatUuidFromBuffer(buf: Buffer): string {
  if (buf.length < 16) return '';
  const hex = buf.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Rate-limited reporting of unauthorized scanner/probe attempts to prevent log & memory flooding
let rejectedVlessCount = 0;
let lastRejectedVlessLog = 0;
let rejectedTrojanCount = 0;
let lastRejectedTrojanLog = 0;

const suspiciousIps = new Map<string, { count: number; firstSeen: number }>();

function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isIpRateLimited(ip: string): boolean {
  if (ip === 'unknown') return false;
  const now = Date.now();
  const entry = suspiciousIps.get(ip);
  if (!entry) return false;

  if (now - entry.firstSeen > 60000) {
    suspiciousIps.delete(ip);
    return false;
  }
  return entry.count >= 10;
}

function recordSuspiciousAttempt(ip: string) {
  if (ip === 'unknown') return;
  const now = Date.now();
  const entry = suspiciousIps.get(ip);
  if (!entry || now - entry.firstSeen > 60000) {
    suspiciousIps.set(ip, { count: 1, firstSeen: now });
  } else {
    entry.count++;
  }
  if (suspiciousIps.size > 200) {
    for (const [k, v] of suspiciousIps.entries()) {
      if (now - v.firstSeen > 60000) suspiciousIps.delete(k);
    }
  }
}

function reportUnauthorizedVless() {
  rejectedVlessCount++;
  const now = Date.now();
  if (now - lastRejectedVlessLog > 60000) {
    console.warn(`[VLESS] Dropped ${rejectedVlessCount} unauthorized probes/connections.`);
    rejectedVlessCount = 0;
    lastRejectedVlessLog = now;
  }
}

function reportUnauthorizedTrojan() {
  rejectedTrojanCount++;
  const now = Date.now();
  if (now - lastRejectedTrojanLog > 60000) {
    console.warn(`[Trojan] Dropped ${rejectedTrojanCount} unauthorized probes/connections.`);
    rejectedTrojanCount = 0;
    lastRejectedTrojanLog = now;
  }
}

function isMemoryExhausted(): boolean {
  try {
    const mem = process.memoryUsage();
    if (mem.rss > 420 * 1024 * 1024 || mem.heapUsed > 350 * 1024 * 1024) {
      return true;
    }
  } catch (e) {}
  return false;
}

// Low highWaterMark for Wasmer constrained environment
const PROXY_HIGH_WATER_MARK = 64 * 1024; // 64KB
const MAX_WS_BUFFERED_AMOUNT = 256 * 1024; // 256KB cap on WebSocket pending writes

// Parse VLESS packet and proxy to destination
function handleVlessConnection(ws: WebSocket, req: http.IncomingMessage) {
  const clientIp = getClientIp(req);
  if (isIpRateLimited(clientIp)) {
    try { ws.close(4003, 'Rate limited'); } catch (e) {}
    return;
  }

  if (isMemoryExhausted() || !isDatabaseReady) {
    try { ws.close(1013, 'Server busy or initializing'); } catch (e) {}
    return;
  }

  let user: UserAccount | null = null;
  let targetSocket: net.Socket | null = null;
  let isHandshakeComplete = false;
  let isAuthenticatedConnection = false;
  let isCleaningUp = false;

  const cleanupConnection = () => {
    if (isCleaningUp) return;
    isCleaningUp = true;

    if (isAuthenticatedConnection) {
      liveConnectionsCount = Math.max(0, liveConnectionsCount - 1);
      isAuthenticatedConnection = false;
    }

    if (targetSocket) {
      try {
        targetSocket.removeAllListeners();
        targetSocket.destroy();
      } catch (e) {}
      targetSocket = null;
    }

    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try { ws.close(); } catch (e) {}
    }
  };

  ws.on('message', (data: Buffer) => {
    if (!Buffer.isBuffer(data)) {
      data = Buffer.from(data as any);
    }

    // Step 1: Handshake and Authentication
    if (!isHandshakeComplete) {
      if (data.length < 18) {
        recordSuspiciousAttempt(clientIp);
        try { ws.close(1002, 'VLESS: Packet too short'); } catch (e) {}
        return;
      }

      const version = data[0];
      if (version !== 0) {
        recordSuspiciousAttempt(clientIp);
        try { ws.close(1002, 'VLESS: Unsupported protocol version'); } catch (e) {}
        return;
      }

      // Extract client UUID
      const clientUuid = formatUuidFromBuffer(data.subarray(1, 17));
      
      // Match registered user by UUID or token
      user = db.users.find(u => (u.uuid && u.uuid.toLowerCase() === clientUuid.toLowerCase()) || u.token === clientUuid) || null;

      if (!user) {
        recordSuspiciousAttempt(clientIp);
        reportUnauthorizedVless();
        try { ws.close(4003, 'Unauthorized'); } catch (e) {}
        return;
      }

      if (!user.active) {
        try { ws.close(4003, 'User account suspended'); } catch (e) {}
        return;
      }

      const isExpired = new Date(user.expireAt).getTime() < Date.now();
      const totalUsedBytes = user.usedUploadBytes + user.usedDownloadBytes;
      const maxAllowedBytes = user.quotaGB * 1024 * 1024 * 1024;

      if (isExpired || totalUsedBytes >= maxAllowedBytes) {
        try { ws.close(4003, 'Traffic quota exceeded or expired'); } catch (e) {}
        return;
      }

      if (!isAuthenticatedConnection) {
        isAuthenticatedConnection = true;
        liveConnectionsCount++;
        totalConnectionsServed++;
      }

      user.lastConnectedAt = new Date().toISOString();
      markDatabaseDirty();

      // Parse target address and port
      const addonLength = data[17];
      const cursor = 18 + addonLength;
      
      if (data.length < cursor + 4) {
        try { ws.close(1002, 'VLESS: Malformed command header'); } catch (e) {}
        return;
      }

      const command = data[cursor]; // 0x01 = TCP, 0x02 = UDP
      const targetPort = data.readUInt16BE(cursor + 1);
      const addressType = data[cursor + 3];

      let targetHost = '';
      let addressLength = 0;

      if (addressType === 0x01) {
        targetHost = data.subarray(cursor + 4, cursor + 8).join('.');
        addressLength = 4;
      } else if (addressType === 0x02) {
        const domainLen = data[cursor + 4];
        targetHost = data.toString('utf8', cursor + 5, cursor + 5 + domainLen);
        addressLength = 1 + domainLen;
      } else if (addressType === 0x03) {
        const ipv6Parts: string[] = [];
        for (let i = 0; i < 16; i += 2) {
          ipv6Parts.push(data.readUInt16BE(cursor + 4 + i).toString(16));
        }
        targetHost = ipv6Parts.join(':');
        addressLength = 16;
      } else {
        try { ws.close(1002, 'VLESS: Unsupported address type'); } catch (e) {}
        return;
      }

      const initialPayload = data.subarray(cursor + 4 + addressLength);

      try {
        const socket = new net.Socket();
        (socket as any).writableHighWaterMark = PROXY_HIGH_WATER_MARK;
        (socket as any).readableHighWaterMark = PROXY_HIGH_WATER_MARK;
        targetSocket = socket;

        socket.on('drain', () => {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.resume(); } catch (e) {}
          }
        });

        socket.connect({ host: targetHost, port: targetPort }, () => {
          try {
            ws.send(Buffer.from([0x00, 0x00]));
          } catch (e) {
            cleanupConnection();
            return;
          }
          isHandshakeComplete = true;

          if (initialPayload.length > 0 && !socket.destroyed) {
            const flushed = socket.write(initialPayload);
            if (!flushed) {
              try { ws.pause(); } catch (e) {}
            }
            const len = initialPayload.length;
            sessionUploadBytes += len;
            uploadBytesWindow += len;
            db.lifetimeUploadBytes = (db.lifetimeUploadBytes || 0) + len;
            if (user) {
              user.usedUploadBytes += len;
              markDatabaseDirty();
            }
          }
        });

        socket.on('data', (chunk) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          if (isMemoryExhausted()) {
            cleanupConnection();
            return;
          }

          if (ws.bufferedAmount > MAX_WS_BUFFERED_AMOUNT) {
            socket.pause();
            const resumeCheck = setInterval(() => {
              if (ws.readyState !== WebSocket.OPEN || socket.destroyed) {
                clearInterval(resumeCheck);
                return;
              }
              if (ws.bufferedAmount <= PROXY_HIGH_WATER_MARK) {
                clearInterval(resumeCheck);
                try { socket.resume(); } catch (e) {}
              }
            }, 20);
          }

          try {
            ws.send(chunk);
            const len = chunk.length;
            sessionDownloadBytes += len;
            downloadBytesWindow += len;
            db.lifetimeDownloadBytes = (db.lifetimeDownloadBytes || 0) + len;
            if (user) {
              user.usedDownloadBytes += len;
              markDatabaseDirty();
            }
          } catch (e) {
            cleanupConnection();
          }
        });

        socket.on('error', cleanupConnection);
        socket.on('close', cleanupConnection);

      } catch (err) {
        cleanupConnection();
      }

      return;
    }

    // Step 2: Streaming data forwarding with backpressure
    if (isHandshakeComplete && targetSocket && !targetSocket.destroyed) {
      if (isMemoryExhausted()) {
        cleanupConnection();
        return;
      }

      const flushed = targetSocket.write(data);
      if (!flushed) {
        try { ws.pause(); } catch (e) {}
      }

      const len = data.length;
      sessionUploadBytes += len;
      uploadBytesWindow += len;
      db.lifetimeUploadBytes = (db.lifetimeUploadBytes || 0) + len;
      if (user) {
        user.usedUploadBytes += len;
        markDatabaseDirty();
      }
    }
  });

  ws.on('close', cleanupConnection);
  ws.on('error', cleanupConnection);
}

// Parse Trojan packet and proxy to destination
function handleTrojanConnection(ws: WebSocket, req: http.IncomingMessage) {
  const clientIp = getClientIp(req);
  if (isIpRateLimited(clientIp)) {
    try { ws.close(4003, 'Rate limited'); } catch (e) {}
    return;
  }

  if (isMemoryExhausted() || !isDatabaseReady) {
    try { ws.close(1013, 'Server busy or initializing'); } catch (e) {}
    return;
  }

  let user: UserAccount | null = null;
  let targetSocket: net.Socket | null = null;
  let isHandshakeComplete = false;
  let isAuthenticatedConnection = false;
  let isCleaningUp = false;

  const cleanupConnection = () => {
    if (isCleaningUp) return;
    isCleaningUp = true;

    if (isAuthenticatedConnection) {
      liveConnectionsCount = Math.max(0, liveConnectionsCount - 1);
      isAuthenticatedConnection = false;
    }

    if (targetSocket) {
      try {
        targetSocket.removeAllListeners();
        targetSocket.destroy();
      } catch (e) {}
      targetSocket = null;
    }

    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try { ws.close(); } catch (e) {}
    }
  };

  ws.on('message', (data: Buffer) => {
    if (!Buffer.isBuffer(data)) {
      data = Buffer.from(data as any);
    }

    if (!isHandshakeComplete) {
      if (data.length < 58) {
        recordSuspiciousAttempt(clientIp);
        try { ws.close(1002, 'Trojan: Packet too short'); } catch (e) {}
        return;
      }

      const clientHexHash = data.toString('ascii', 0, 56);

      user = db.users.find(u => {
        const pass = u.trojanPassword || u.token;
        const expectedHash = crypto.createHash('sha224').update(pass).digest('hex');
        return expectedHash.toLowerCase() === clientHexHash.toLowerCase();
      }) || null;

      if (!user) {
        recordSuspiciousAttempt(clientIp);
        reportUnauthorizedTrojan();
        try { ws.close(4003, 'Unauthorized'); } catch (e) {}
        return;
      }

      if (!user.active) {
        try { ws.close(4003, 'User account suspended'); } catch (e) {}
        return;
      }

      const isExpired = new Date(user.expireAt).getTime() < Date.now();
      const totalUsedBytes = user.usedUploadBytes + user.usedDownloadBytes;
      const maxAllowedBytes = user.quotaGB * 1024 * 1024 * 1024;

      if (isExpired || totalUsedBytes >= maxAllowedBytes) {
        try { ws.close(4003, 'Traffic quota exceeded'); } catch (e) {}
        return;
      }

      if (!isAuthenticatedConnection) {
        isAuthenticatedConnection = true;
        liveConnectionsCount++;
        totalConnectionsServed++;
      }

      user.lastConnectedAt = new Date().toISOString();
      markDatabaseDirty();

      const command = data[58]; // 0x01 = CONNECT
      const addressType = data[59];

      let targetHost = '';
      let cursor = 60;

      if (addressType === 0x01) {
        targetHost = data.subarray(cursor, cursor + 4).join('.');
        cursor += 4;
      } else if (addressType === 0x03) {
        const domainLen = data[cursor];
        targetHost = data.toString('utf8', cursor + 1, cursor + 1 + domainLen);
        cursor += 1 + domainLen;
      } else {
        try { ws.close(1002, 'Trojan: Unsupported address type'); } catch (e) {}
        return;
      }

      const targetPort = data.readUInt16BE(cursor);
      cursor += 2;
      cursor += 2; // skip \r\n

      const initialPayload = data.subarray(cursor);

      try {
        const socket = new net.Socket();
        (socket as any).writableHighWaterMark = PROXY_HIGH_WATER_MARK;
        (socket as any).readableHighWaterMark = PROXY_HIGH_WATER_MARK;
        targetSocket = socket;

        socket.on('drain', () => {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.resume(); } catch (e) {}
          }
        });

        socket.connect({ host: targetHost, port: targetPort }, () => {
          isHandshakeComplete = true;
          if (initialPayload.length > 0 && !socket.destroyed) {
            const flushed = socket.write(initialPayload);
            if (!flushed) {
              try { ws.pause(); } catch (e) {}
            }
            const len = initialPayload.length;
            sessionUploadBytes += len;
            uploadBytesWindow += len;
            db.lifetimeUploadBytes = (db.lifetimeUploadBytes || 0) + len;
            if (user) {
              user.usedUploadBytes += len;
              markDatabaseDirty();
            }
          }
        });

        socket.on('data', (chunk) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          if (isMemoryExhausted()) {
            cleanupConnection();
            return;
          }

          if (ws.bufferedAmount > MAX_WS_BUFFERED_AMOUNT) {
            socket.pause();
            const resumeCheck = setInterval(() => {
              if (ws.readyState !== WebSocket.OPEN || socket.destroyed) {
                clearInterval(resumeCheck);
                return;
              }
              if (ws.bufferedAmount <= PROXY_HIGH_WATER_MARK) {
                clearInterval(resumeCheck);
                try { socket.resume(); } catch (e) {}
              }
            }, 20);
          }

          try {
            ws.send(chunk);
            const len = chunk.length;
            sessionDownloadBytes += len;
            downloadBytesWindow += len;
            db.lifetimeDownloadBytes = (db.lifetimeDownloadBytes || 0) + len;
            if (user) {
              user.usedDownloadBytes += len;
              markDatabaseDirty();
            }
          } catch (e) {
            cleanupConnection();
          }
        });

        socket.on('error', cleanupConnection);
        socket.on('close', cleanupConnection);

      } catch (err) {
        cleanupConnection();
      }

      return;
    }

    if (isHandshakeComplete && targetSocket && !targetSocket.destroyed) {
      if (isMemoryExhausted()) {
        cleanupConnection();
        return;
      }

      const flushed = targetSocket.write(data);
      if (!flushed) {
        try { ws.pause(); } catch (e) {}
      }

      const len = data.length;
      sessionUploadBytes += len;
      uploadBytesWindow += len;
      db.lifetimeUploadBytes = (db.lifetimeUploadBytes || 0) + len;
      if (user) {
        user.usedUploadBytes += len;
        markDatabaseDirty();
      }
    }
  });

  ws.on('close', cleanupConnection);
  ws.on('error', cleanupConnection);
}

// WebSocket Server Router with perMessageDeflate disabled
const wss = new WebSocketServer({ 
  noServer: true,
  maxPayload: 256 * 1024,
  perMessageDeflate: false,
});

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url ? request.url.split('?')[0] : '';

  if (pathname === '/vless-ws' || pathname === '/vless-wasmer' || pathname.startsWith('/vless')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleVlessConnection(ws, request);
    });
  } else if (pathname === '/trojan-ws' || pathname === '/trojan-wasmer' || pathname.startsWith('/trojan')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleTrojanConnection(ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ==========================================
// 3. HEALTH & READINESS ENDPOINTS (Liveness & Readiness Probes)
// ==========================================
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.get('/readyz', (req, res) => {
  const storageInfo = persistence.getStats();
  if (isDatabaseReady && persistence.isReady()) {
    return res.status(200).json({
      status: 'ready',
      database: {
        type: storageInfo.type,
        connected: true,
      }
    });
  }
  return res.status(503).json({
    status: 'unavailable',
    database: {
      type: storageInfo.type,
      connected: false,
    },
    message: 'Database is initializing or temporarily unavailable.'
  });
});

// ==========================================
// 4. ADMIN AUTHENTICATION & SESSIONS
// ==========================================
function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const session = db.sessions ? db.sessions[token] : null;

  if (!session || session.expiresAt < Date.now()) {
    if (session && db.sessions) {
      delete db.sessions[token];
      markDatabaseDirty();
    }
    return res.status(401).json({ success: false, error: 'Session expired or invalid' });
  }

  // Extend session
  session.expiresAt = Date.now() + 24 * 3600 * 1000;
  markDatabaseDirty();
  next();
}

app.post('/api/auth/login', async (req, res) => {
  const clientIp = getClientIp(req);
  if (isLoginRateLimited(clientIp)) {
    return res.status(429).json({ success: false, message: 'Too many login attempts. Please wait 1 minute.' });
  }

  const { username, password } = req.body;
  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  const targetUser = db.adminUsername || INITIAL_ADMIN_USER;
  const targetHash = db.adminPasswordHash || INITIAL_ADMIN_HASH;
  const providedHash = hashPassword(password);

  const isUserMatch = username.trim() === targetUser;
  // Constant-time hash comparison
  const isPassMatch = crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(targetHash));

  if (!isUserMatch || !isPassMatch) {
    recordLoginFailure(clientIp);
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  clearLoginAttempts(clientIp);

  const token = `adm_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = Date.now() + 24 * 3600 * 1000; // 24 hours

  if (!db.sessions) db.sessions = {};
  db.sessions[token] = { username: targetUser, expiresAt };
  markDatabaseDirty();
  await flushDatabaseToDisk();

  res.json({
    success: true,
    token,
    username: targetUser,
    expiresAt: new Date(expiresAt).toISOString()
  });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (db.sessions && db.sessions[token]) {
      delete db.sessions[token];
      markDatabaseDirty();
    }
  }
  res.json({ success: true, message: 'Logged out' });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }
  const token = authHeader.split(' ')[1];
  const session = db.sessions ? db.sessions[token] : null;
  if (!session || session.expiresAt < Date.now()) {
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true, username: session.username });
});

app.post('/api/auth/change-password', requireAdminAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  const currentHash = db.adminPasswordHash || INITIAL_ADMIN_HASH;
  const providedOldHash = hashPassword(oldPassword || '');

  if (!crypto.timingSafeEqual(Buffer.from(providedOldHash), Buffer.from(currentHash))) {
    return res.status(400).json({ success: false, message: 'Old password is incorrect' });
  }

  db.adminPasswordHash = hashPassword(newPassword);
  markDatabaseDirty();
  await flushDatabaseToDisk(true);

  res.json({ success: true, message: 'Password changed and permanently persisted' });
});

// ==========================================
// 5. SUBSCRIPTION ENDPOINT (MAHSANG / V2RAYNG)
// ==========================================
app.get('/sub/:token', (req, res) => {
  const token = req.params.token;
  const user = db.users.find(u => u.token === token);

  if (!user) {
    return res.status(404).send('Subscription not found. Invalid Token.');
  }

  if (!user.active) {
    return res.status(403).send('Account suspended.');
  }

  const isExpired = new Date(user.expireAt).getTime() < Date.now();
  const totalUsedBytes = user.usedUploadBytes + user.usedDownloadBytes;
  const maxBytes = user.quotaGB * 1024 * 1024 * 1024;
  const isQuotaExceeded = totalUsedBytes >= maxBytes;

  const incomingHost = req.headers.host || 'my-app.wasmer.app';
  const cleanHost = incomingHost.split(':')[0];

  const personalizedConfigs = generateUserPersonalizedConfigs(user, db.configs, cleanHost);

  const expireTimestamp = Math.floor(new Date(user.expireAt).getTime() / 1000);
  res.setHeader(
    'Subscription-Userinfo',
    `upload=${user.usedUploadBytes}; download=${user.usedDownloadBytes}; total=${maxBytes}; expire=${expireTimestamp}`
  );
  res.setHeader('Profile-Update-Interval', '6');
  res.setHeader('Profile-Title', `Shirin-RayPanel: ${user.username}`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (isExpired || isQuotaExceeded) {
    const alertMsg = isExpired ? '⚠️ Subscription Expired' : '⚠️ Data Quota Exceeded';
    const alertConfig: ProxyConfig = {
      id: 'alert-expired-node',
      name: alertMsg,
      protocol: 'vless',
      server: '127.0.0.1',
      port: 443,
      transport: 'ws',
      security: 'none',
      remark: alertMsg,
      active: true,
      createdAt: new Date().toISOString()
    };
    return res.send(generateSubscriptionBase64([alertConfig]));
  }

  const format = req.query.format as string;
  if (format === 'raw') {
    return res.send(personalizedConfigs.map(generateConfigUri).join('\n'));
  }

  const base64Sub = generateSubscriptionBase64(personalizedConfigs);
  res.send(base64Sub);
});

// ==========================================
// 6. PROTECTED ADMIN MANAGEMENT APIS
// ==========================================

// --- Configs API ---
app.get('/api/configs', requireAdminAuth, (req, res) => {
  res.json({ configs: db.configs });
});

app.post('/api/configs', requireAdminAuth, async (req, res) => {
  const newConfig: ProxyConfig = {
    ...req.body,
    id: req.body.id || `cfg-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  db.configs.unshift(newConfig);
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true, config: newConfig });
});

app.put('/api/configs/:id', requireAdminAuth, async (req, res) => {
  const id = req.params.id;
  const index = db.configs.findIndex(c => c.id === id);
  if (index === -1) return res.status(404).json({ error: 'Config not found' });

  db.configs[index] = { ...db.configs[index], ...req.body };
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true, config: db.configs[index] });
});

app.delete('/api/configs/:id', requireAdminAuth, async (req, res) => {
  const id = req.params.id;
  db.configs = db.configs.filter(c => c.id !== id);
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true });
});

// --- Users API ---
app.get('/api/users', requireAdminAuth, (req, res) => {
  res.json({ users: db.users });
});

app.post('/api/users', requireAdminAuth, async (req, res) => {
  const newUser: UserAccount = {
    ...req.body,
    id: req.body.id || `usr-${Date.now()}`,
    token: req.body.token || `sub_${crypto.randomBytes(8).toString('hex')}`,
    uuid: req.body.uuid || crypto.randomUUID(),
    trojanPassword: req.body.trojanPassword || `Pass_${crypto.randomBytes(6).toString('hex')}`,
    quotaGB: Number(req.body.quotaGB) || 30,
    usedUploadBytes: req.body.usedUploadBytes || 0,
    usedDownloadBytes: req.body.usedDownloadBytes || 0,
    expireAt: req.body.expireAt || new Date(Date.now() + 30 * 86400000).toISOString(),
    active: req.body.active !== undefined ? req.body.active : true,
    allowedConfigs: req.body.allowedConfigs || ['all'],
    createdAt: new Date().toISOString(),
  };

  db.users.unshift(newUser);
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true, user: newUser });
});

app.put('/api/users/:id', requireAdminAuth, async (req, res) => {
  const id = req.params.id;
  const index = db.users.findIndex(u => u.id === id);
  if (index === -1) return res.status(404).json({ error: 'User not found' });

  db.users[index] = { ...db.users[index], ...req.body };
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true, user: db.users[index] });
});

app.delete('/api/users/:id', requireAdminAuth, async (req, res) => {
  const id = req.params.id;
  db.users = db.users.filter(u => u.id !== id);
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true });
});

app.post('/api/users/:id/reset-traffic', requireAdminAuth, async (req, res) => {
  const id = req.params.id;
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.usedUploadBytes = 0;
  user.usedDownloadBytes = 0;
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true, user });
});

// --- Clean IP API ---
app.get('/api/clean-ips', requireAdminAuth, (req, res) => {
  res.json({ cleanIps: db.cleanIps });
});

app.post('/api/clean-ips', requireAdminAuth, async (req, res) => {
  const newIp: CleanIpEntry = {
    ...req.body,
    id: req.body.id || `cip-${Date.now()}`,
    addedAt: new Date().toISOString(),
    active: req.body.active !== undefined ? req.body.active : true
  };
  db.cleanIps.unshift(newIp);
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true, cleanIp: newIp });
});

app.put('/api/clean-ips/:id', requireAdminAuth, async (req, res) => {
  const index = db.cleanIps.findIndex(ip => ip.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'IP not found' });
  db.cleanIps[index] = { ...db.cleanIps[index], ...req.body };
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true, cleanIp: db.cleanIps[index] });
});

app.delete('/api/clean-ips/:id', requireAdminAuth, async (req, res) => {
  db.cleanIps = db.cleanIps.filter(ip => ip.id !== req.params.id);
  markDatabaseDirty();
  await flushDatabaseToDisk(true);
  res.json({ success: true });
});

app.post('/api/clean-ips/:id/ping', requireAdminAuth, async (req, res) => {
  const entry = db.cleanIps.find(ip => ip.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Clean IP not found' });

  const start = Date.now();
  const sock = new net.Socket();
  sock.setTimeout(2500);

  sock.connect(443, entry.ip, () => {
    const latency = Date.now() - start;
    entry.pingMs = latency;
    sock.destroy();
    markDatabaseDirty();
    res.json({ success: true, pingMs: latency });
  });

  sock.on('error', () => {
    sock.destroy();
    res.json({ success: false, pingMs: null, error: 'Connection timed out' });
  });

  sock.on('timeout', () => {
    sock.destroy();
    res.json({ success: false, pingMs: null, error: 'Timed out' });
  });
});

// --- System Stats API ---
app.get('/api/stats', requireAdminAuth, (req, res) => {
  const totalTrafficBytes = db.users.reduce((acc, u) => acc + (u.quotaGB * 1024 * 1024 * 1024), 0);
  const usedTrafficBytes = db.users.reduce((acc, u) => acc + u.usedUploadBytes + u.usedDownloadBytes, 0);

  const totalLifetimeBytes = (db.lifetimeUploadBytes || 0) + (db.lifetimeDownloadBytes || 0);

  const stats: SystemStats = {
    totalConfigs: db.configs.length,
    activeConfigs: db.configs.filter(c => c.active).length,
    totalUsers: db.users.length,
    activeUsers: db.users.filter(u => u.active).length,
    totalTrafficGB: Math.round((totalTrafficBytes / (1024 * 1024 * 1024)) * 10) / 10,
    usedTrafficGB: Math.round((usedTrafficBytes / (1024 * 1024 * 1024)) * 100) / 100,
    todayTrafficMB: Math.round(((sessionUploadBytes + sessionDownloadBytes) / (1024 * 1024)) * 10) / 10,
    sessionTrafficMB: Math.round(((sessionUploadBytes + sessionDownloadBytes) / (1024 * 1024)) * 10) / 10,
    lifetimeTrafficGB: Math.round((totalLifetimeBytes / (1024 * 1024 * 1024)) * 100) / 100,
    lifetimeUploadBytes: db.lifetimeUploadBytes || 0,
    lifetimeDownloadBytes: db.lifetimeDownloadBytes || 0,
    sessionUploadBytes,
    sessionDownloadBytes,
    liveConnections: liveConnectionsCount,
    totalConnectionsServed,
    liveUploadSpeedBps,
    liveDownloadSpeedBps,
    totalUploadBytes: db.lifetimeUploadBytes || sessionUploadBytes,
    totalDownloadBytes: db.lifetimeDownloadBytes || sessionDownloadBytes,
  };

  res.json({ stats });
});

// --- Database Export / Import ---
app.get('/api/database/export', requireAdminAuth, (req, res) => {
  // Sanitize passwords/hashes from export for security
  const safeExport = {
    ...db,
    adminPasswordHash: undefined,
    sessions: undefined,
  };
  res.setHeader('Content-Disposition', `attachment; filename=raypanel-database-${new Date().toISOString().slice(0, 10)}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(safeExport, null, 2));
});

app.post('/api/database/import', requireAdminAuth, async (req, res) => {
  try {
    const imported = req.body;
    if (imported && Array.isArray(imported.configs) && Array.isArray(imported.users)) {
      db.configs = imported.configs;
      db.users = imported.users;
      if (Array.isArray(imported.cleanIps)) db.cleanIps = imported.cleanIps;
      markDatabaseDirty();
      await flushDatabaseToDisk(true);
      return res.json({ success: true, message: 'Database imported successfully' });
    }
    res.status(400).json({ success: false, message: 'Invalid database schema' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Import failed' });
  }
});

// ==========================================
// 7. FRONTEND SERVING & STRICT STATIC ISOLATION
// ==========================================
// Prevent public downloading of server bundles or private files
app.use((req, res, next) => {
  const normalizedPath = req.path.toLowerCase();
  if (
    normalizedPath.endsWith('.cjs') ||
    normalizedPath.endsWith('.ts') ||
    normalizedPath.includes('server') ||
    normalizedPath.includes('.env') ||
    normalizedPath.includes('database.json')
  ) {
    return res.status(403).json({ error: 'Access forbidden' });
  }
  next();
});

async function startServer() {
  await initializeDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, strictly serve static client assets from dist/client ONLY
    const clientDistPath = path.join(process.cwd(), 'dist', 'client');
    const fallbackDistPath = path.join(process.cwd(), 'dist');
    const staticDir = fs.existsSync(clientDistPath) ? clientDistPath : fallbackDistPath;

    app.use(express.static(staticDir, {
      index: false,
      dotfiles: 'ignore',
    }));

    app.get('*', (req, res) => {
      const indexPath = path.join(staticDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Frontend bundle not built yet.');
      }
    });
  }

  // Catch HTTP protocol errors from scanners
  server.on('clientError', (err: any, socket: net.Socket) => {
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    } else {
      socket.destroy();
    }
  });

  server.on('error', (err: any) => {
    console.error('Server error swallowed:', err?.message || err);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Shirin / RayPanel Server running on http://0.0.0.0:${PORT}`);
    console.log(`📡 VLESS WS Endpoint: ws://0.0.0.0:${PORT}/vless-ws`);
    console.log(`📡 Trojan WS Endpoint: ws://0.0.0.0:${PORT}/trojan-ws`);
  });
}

// Graceful Shutdown Handler (SIGTERM & SIGINT)
async function handleGracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  // 1. Flush database immediately
  try {
    await flushDatabaseToDisk(true);
    console.log('💾 Database flushed to disk successfully.');
  } catch (e) {
    console.error('Failed to flush database during shutdown:', e);
  }

  // 2. Terminate WebSocket connections cleanly
  try {
    wss.clients.forEach(client => {
      try {
        client.close(1001, 'Server shutting down');
      } catch (e) {}
    });
    wss.close();
  } catch (e) {}

  // 3. Close persistence connections
  try {
    await persistence.close();
  } catch (e) {}

  // 4. Close HTTP/TCP server
  server.close(() => {
    console.log('👋 Shirin server closed gracefully. Exiting.');
    process.exit(0);
  });

  // Force exit if hanging
  setTimeout(() => {
    console.warn('⚠️ Force exit after timeout.');
    process.exit(0);
  }, 4000);
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { 
  app, 
  server, 
  db, 
  wss, 
  startServer, 
  handleGracefulShutdown, 
  persistence 
};
