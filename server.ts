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

const app = express();
const server = http.createServer(app);

// Dynamic Port (Wasmer: 8080 or custom, Railway: PORT, Local: 3000)
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Admin Credentials from Environment or Defaults
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
let ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Active admin sessions tokens
const activeSessions = new Map<string, { username: string; expiresAt: number }>();

app.use(express.json());

// ==========================================
// 1. DURABLE DATABASE & BACKUP SYSTEM
// ==========================================
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const DB_BACKUP_FILE = path.join(DATA_DIR, 'database.bak.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Initial default Clean IPs for Iranian Operators
const defaultCleanIps: CleanIpEntry[] = [
  {
    id: 'cip-mci-1',
    ip: '104.16.132.229',
    operator: 'mci',
    name: 'MCI Cloudflare Anycast 1',
    ispNameFa: 'همراه اول (تهران / شیراز)',
    pingMs: 42,
    active: true,
    addedAt: new Date().toISOString(),
    notes: 'پینگ عالی و پایدار روی همراه اول'
  },
  {
    id: 'cip-mci-2',
    ip: '162.159.192.1',
    operator: 'mci',
    name: 'MCI Cloudflare Subnet 162',
    ispNameFa: 'همراه اول (کل کشور)',
    pingMs: 48,
    active: true,
    addedAt: new Date().toISOString(),
    notes: 'تست شده بدون پکت لاس'
  },
  {
    id: 'cip-irancell-1',
    ip: '162.159.136.232',
    operator: 'irancell',
    name: 'MTN Irancell Fast IP 1',
    ispNameFa: 'ایرانسل (LTE / 5G)',
    pingMs: 38,
    active: true,
    addedAt: new Date().toISOString(),
    notes: 'سرعت دانلود بالا روی دکل‌های ایرانسل'
  },
  {
    id: 'cip-irancell-2',
    ip: '104.17.209.9',
    operator: 'irancell',
    name: 'MTN Irancell CDN IP 2',
    ispNameFa: 'ایرانسل (مشهد / تبریز)',
    pingMs: 45,
    active: true,
    addedAt: new Date().toISOString(),
    notes: 'بسیار پایدار برای وب‌سوکت'
  },
  {
    id: 'cip-rightel-1',
    ip: '104.21.48.1',
    operator: 'rightel',
    name: 'Rightel Optimized IP',
    ispNameFa: 'رایتل (3G / 4G)',
    pingMs: 55,
    active: true,
    addedAt: new Date().toISOString(),
    notes: 'مناسب اینترنت رایتل'
  },
  {
    id: 'cip-fixed-1',
    ip: '104.19.154.241',
    operator: 'fixed',
    name: 'Fixed Line (Shatel / Mokhaberat)',
    ispNameFa: 'شاتل / مخابرات / آسیاتک',
    pingMs: 34,
    active: true,
    addedAt: new Date().toISOString(),
    notes: 'تست شده روی ADSL و فیبر نوری تانوما'
  }
];

// Initial default Proxy configs
const defaultConfigs: ProxyConfig[] = [
  {
    id: 'cfg-vless-ws-1',
    name: 'Wasmer VLESS-WS (همراه اول / MCI)',
    protocol: 'vless',
    server: 'my-app.wasmer.app',
    port: 443,
    uuid: 'e7b1a23c-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
    transport: 'ws',
    path: '/vless-ws',
    host: 'my-app.wasmer.app',
    sni: 'my-app.wasmer.app',
    security: 'tls',
    remark: '⚡ Wasmer VLESS WS-TLS 🇮🇷 MCI',
    operatorPreset: 'mci',
    cleanIp: '104.16.132.229',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cfg-trojan-ws-2',
    name: 'Wasmer Trojan-WS (ایرانسل / Irancell)',
    protocol: 'trojan',
    server: 'my-app.wasmer.app',
    port: 443,
    password: 'WasmerPass_2026_SecureKey',
    transport: 'ws',
    path: '/trojan-ws',
    host: 'my-app.wasmer.app',
    sni: 'my-app.wasmer.app',
    security: 'tls',
    remark: '🚀 Wasmer Trojan WS-TLS 🇮🇷 Irancell',
    operatorPreset: 'irancell',
    cleanIp: '162.159.136.232',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cfg-vless-reality-3',
    name: 'VLESS Reality TCP Vision (ضد فیلتر)',
    protocol: 'vless',
    server: '185.199.110.153',
    port: 443,
    uuid: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    transport: 'tcp',
    security: 'reality',
    realityPublicKey: 'Iq5dE8Z7yL4k-9Nm1xW3vP6qR8sT0uV2wX4yZ6aB8cD',
    realityShortId: '6ba7b810',
    spiderX: '/',
    flow: 'xtls-rprx-vision',
    sni: 'www.microsoft.com',
    remark: '🔒 VLESS Reality TCP ⚡ Anti-Filter',
    operatorPreset: 'all',
    cleanIp: '104.16.132.229',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cfg-http-proxy-4',
    name: 'HTTP Secure Proxy (Auth)',
    protocol: 'http',
    server: 'my-app.wasmer.app',
    port: 8080,
    username: 'rayuser',
    password: 'securePass7788',
    transport: 'tcp',
    security: 'none',
    remark: '🌐 HTTP Auth Proxy',
    operatorPreset: 'mokhaberat',
    active: true,
    createdAt: new Date().toISOString(),
  }
];

const defaultUsers: UserAccount[] = [
  {
    id: 'usr-admin-1',
    username: 'soshiant_vip',
    email: 'soshiant@example.com',
    token: 'sub_vip_soshiant_998877',
    uuid: 'e7b1a23c-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
    trojanPassword: 'WasmerPass_2026_SecureKey',
    quotaGB: 60,
    usedUploadBytes: 1024 * 1024 * 480, // 480 MB
    usedDownloadBytes: 1024 * 1024 * 1024 * 9.2, // 9.2 GB
    expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    active: true,
    allowedConfigs: ['all'],
    notes: 'اکانت نامحدود VIP مهسا آن‌جی',
    createdAt: new Date().toISOString(),
    lastConnectedAt: new Date().toISOString(),
  },
  {
    id: 'usr-daily-2',
    username: 'family_daily',
    email: 'family@example.com',
    token: 'sub_family_daily_334455',
    uuid: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    trojanPassword: 'FamilyPass2026',
    quotaGB: 30,
    usedUploadBytes: 1024 * 1024 * 140,
    usedDownloadBytes: 1024 * 1024 * 1024 * 4.1,
    expireAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    active: true,
    allowedConfigs: ['cfg-vless-ws-1', 'cfg-trojan-ws-2'],
    notes: 'کاربر خانواده - تست همراه اول و ایرانسل',
    createdAt: new Date().toISOString(),
    lastConnectedAt: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
  }
];

interface DatabaseSchema {
  configs: ProxyConfig[];
  users: UserAccount[];
  cleanIps: CleanIpEntry[];
  traffic: TrafficRecord[];
  settings: DatabaseSettings;
  adminPasswordHash?: string;
}

let db: DatabaseSchema = {
  configs: defaultConfigs,
  users: defaultUsers,
  cleanIps: defaultCleanIps,
  traffic: [],
  settings: {
    type: 'local_json',
    autoBackup: true,
    lastBackupAt: new Date().toISOString(),
    status: 'connected',
    lastSynced: new Date().toISOString(),
    adminUsername: ADMIN_USER
  }
};

// Hash password helper
function hashPassword(pass: string): string {
  return crypto.createHash('sha256').update(pass + SESSION_SECRET).digest('hex');
}

// Load database from disk
function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.configs && Array.isArray(parsed.configs)) {
        db = {
          ...db,
          ...parsed,
          cleanIps: Array.isArray(parsed.cleanIps) && parsed.cleanIps.length > 0 ? parsed.cleanIps : defaultCleanIps
        };
        console.log('✅ Durable database loaded successfully.');
      }
    } else {
      saveDatabase();
    }
  } catch (err) {
    console.error('⚠️ Error reading primary database, checking backup...', err);
    try {
      if (fs.existsSync(DB_BACKUP_FILE)) {
        const backupData = fs.readFileSync(DB_BACKUP_FILE, 'utf-8');
        db = JSON.parse(backupData);
        console.log('✅ Restored from backup successfully.');
      }
    } catch (bErr) {
      console.error('Failed to load backup:', bErr);
    }
  }
}

// Atomic & Durable save
function saveDatabase() {
  try {
    db.settings.lastSynced = new Date().toISOString();
    const jsonStr = JSON.stringify(db, null, 2);
    const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
    
    // Atomic write
    fs.writeFileSync(tmpFile, jsonStr, 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);

    // Keep active backup
    fs.writeFileSync(DB_BACKUP_FILE, jsonStr, 'utf-8');
  } catch (err) {
    console.error('❌ Error saving database:', err);
  }
}

loadDatabase();

// Periodically create timestamped backup
setInterval(() => {
  try {
    const backupName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(BACKUPS_DIR, backupName), JSON.stringify(db, null, 2), 'utf-8');
    db.settings.lastBackupAt = new Date().toISOString();
  } catch (err) {
    // ignore background backup error
  }
}, 30 * 60 * 1000); // Every 30 mins

// ==========================================
// 2. EMBEDDED REAL PROXY SERVER ENGINE
// ==========================================
let liveConnectionsCount = 0;
let totalConnectionsServed = 0;
let realTotalUploadBytes = 0;
let realTotalDownloadBytes = 0;

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

// Parse VLESS packet and proxy to destination
function handleVlessConnection(ws: WebSocket, req: http.IncomingMessage) {
  liveConnectionsCount++;
  totalConnectionsServed++;

  let user: UserAccount | null = null;
  let targetSocket: net.Socket | null = null;
  let isHandshakeComplete = false;

  ws.on('message', (data: Buffer) => {
    if (!Buffer.isBuffer(data)) {
      data = Buffer.from(data as any);
    }

    // Step 1: Handshake and Authentication
    if (!isHandshakeComplete) {
      if (data.length < 18) {
        ws.close(1002, 'VLESS: Packet too short');
        return;
      }

      const version = data[0];
      if (version !== 0) {
        ws.close(1002, 'VLESS: Unsupported protocol version');
        return;
      }

      // Extract client UUID
      const clientUuid = formatUuidFromBuffer(data.subarray(1, 17));
      
      // Match registered user by UUID or token
      user = db.users.find(u => (u.uuid && u.uuid.toLowerCase() === clientUuid.toLowerCase()) || u.token === clientUuid) || null;

      if (!user) {
        console.warn(`[VLESS] Unauthorized UUID rejected: ${clientUuid}`);
        ws.close(4003, 'Unauthorized UUID');
        return;
      }

      if (!user.active) {
        console.warn(`[VLESS] Inactive user rejected: ${user.username}`);
        ws.close(4003, 'User account suspended');
        return;
      }

      const isExpired = new Date(user.expireAt).getTime() < Date.now();
      const totalUsedBytes = user.usedUploadBytes + user.usedDownloadBytes;
      const maxAllowedBytes = user.quotaGB * 1024 * 1024 * 1024;

      if (isExpired || totalUsedBytes >= maxAllowedBytes) {
        console.warn(`[VLESS] Quota or expiration reached for: ${user.username}`);
        ws.close(4003, 'Traffic quota exceeded or expired');
        return;
      }

      user.lastConnectedAt = new Date().toISOString();

      // Parse target address and port
      const addonLength = data[17];
      const cursor = 18 + addonLength;
      
      if (data.length < cursor + 4) {
        ws.close(1002, 'VLESS: Malformed command header');
        return;
      }

      const command = data[cursor]; // 0x01 = TCP, 0x02 = UDP
      const targetPort = data.readUInt16BE(cursor + 1);
      const addressType = data[cursor + 3];

      let targetHost = '';
      let addressLength = 0;

      if (addressType === 0x01) {
        // IPv4 (4 bytes)
        targetHost = data.subarray(cursor + 4, cursor + 8).join('.');
        addressLength = 4;
      } else if (addressType === 0x02) {
        // Domain Name (1 byte length + string)
        const domainLen = data[cursor + 4];
        targetHost = data.toString('utf8', cursor + 5, cursor + 5 + domainLen);
        addressLength = 1 + domainLen;
      } else if (addressType === 0x03) {
        // IPv6 (16 bytes)
        const ipv6Parts: string[] = [];
        for (let i = 0; i < 16; i += 2) {
          ipv6Parts.push(data.readUInt16BE(cursor + 4 + i).toString(16));
        }
        targetHost = ipv6Parts.join(':');
        addressLength = 16;
      } else {
        ws.close(1002, 'VLESS: Unsupported address type');
        return;
      }

      const initialPayload = data.subarray(cursor + 4 + addressLength);

      // Establish target TCP connection
      try {
        targetSocket = net.connect({ host: targetHost, port: targetPort }, () => {
          // VLESS Success response header: [version: 0x00, addon length: 0x00]
          ws.send(Buffer.from([0x00, 0x00]));
          isHandshakeComplete = true;

          // Forward initial payload if present
          if (initialPayload.length > 0 && targetSocket) {
            targetSocket.write(initialPayload);
            const len = initialPayload.length;
            realTotalUploadBytes += len;
            uploadBytesWindow += len;
            if (user) user.usedUploadBytes += len;
          }
        });

        // Forward from target TCP socket to client WebSocket
        targetSocket.on('data', (chunk) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);
            const len = chunk.length;
            realTotalDownloadBytes += len;
            downloadBytesWindow += len;
            if (user) user.usedDownloadBytes += len;
          }
        });

        targetSocket.on('error', (err) => {
          ws.close();
        });

        targetSocket.on('close', () => {
          ws.close();
        });

      } catch (err) {
        ws.close();
      }

      return;
    }

    // Step 2: Streaming data forwarding from WebSocket to Target TCP
    if (isHandshakeComplete && targetSocket && !targetSocket.destroyed) {
      targetSocket.write(data);
      const len = data.length;
      realTotalUploadBytes += len;
      uploadBytesWindow += len;
      if (user) user.usedUploadBytes += len;
    }
  });

  ws.on('close', () => {
    liveConnectionsCount = Math.max(0, liveConnectionsCount - 1);
    if (targetSocket && !targetSocket.destroyed) {
      targetSocket.destroy();
    }
    saveDatabase();
  });

  ws.on('error', () => {
    if (targetSocket && !targetSocket.destroyed) {
      targetSocket.destroy();
    }
  });
}

// Parse Trojan packet and proxy to destination
function handleTrojanConnection(ws: WebSocket, req: http.IncomingMessage) {
  liveConnectionsCount++;
  totalConnectionsServed++;

  let user: UserAccount | null = null;
  let targetSocket: net.Socket | null = null;
  let isHandshakeComplete = false;

  ws.on('message', (data: Buffer) => {
    if (!Buffer.isBuffer(data)) {
      data = Buffer.from(data as any);
    }

    if (!isHandshakeComplete) {
      if (data.length < 58) {
        ws.close(1002, 'Trojan: Packet too short');
        return;
      }

      // Trojan password hash is 56 hex chars (SHA224)
      const clientHexHash = data.toString('ascii', 0, 56);

      // Match user by comparing SHA224 of trojanPassword or token
      user = db.users.find(u => {
        const pass = u.trojanPassword || u.token;
        const expectedHash = crypto.createHash('sha224').update(pass).digest('hex');
        return expectedHash.toLowerCase() === clientHexHash.toLowerCase();
      }) || null;

      if (!user) {
        ws.close(4003, 'Unauthorized Trojan Password');
        return;
      }

      if (!user.active) {
        ws.close(4003, 'User account suspended');
        return;
      }

      const isExpired = new Date(user.expireAt).getTime() < Date.now();
      const totalUsedBytes = user.usedUploadBytes + user.usedDownloadBytes;
      const maxAllowedBytes = user.quotaGB * 1024 * 1024 * 1024;

      if (isExpired || totalUsedBytes >= maxAllowedBytes) {
        ws.close(4003, 'Traffic quota exceeded');
        return;
      }

      user.lastConnectedAt = new Date().toISOString();

      // Parse target address
      // Bytes 56, 57 are \r\n
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
        ws.close(1002, 'Trojan: Unsupported address type');
        return;
      }

      const targetPort = data.readUInt16BE(cursor);
      cursor += 2;
      // Skip \r\n (2 bytes)
      cursor += 2;

      const initialPayload = data.subarray(cursor);

      try {
        targetSocket = net.connect({ host: targetHost, port: targetPort }, () => {
          isHandshakeComplete = true;
          if (initialPayload.length > 0 && targetSocket) {
            targetSocket.write(initialPayload);
            const len = initialPayload.length;
            realTotalUploadBytes += len;
            uploadBytesWindow += len;
            if (user) user.usedUploadBytes += len;
          }
        });

        targetSocket.on('data', (chunk) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);
            const len = chunk.length;
            realTotalDownloadBytes += len;
            downloadBytesWindow += len;
            if (user) user.usedDownloadBytes += len;
          }
        });

        targetSocket.on('error', () => ws.close());
        targetSocket.on('close', () => ws.close());
      } catch (err) {
        ws.close();
      }

      return;
    }

    if (isHandshakeComplete && targetSocket && !targetSocket.destroyed) {
      targetSocket.write(data);
      const len = data.length;
      realTotalUploadBytes += len;
      uploadBytesWindow += len;
      if (user) user.usedUploadBytes += len;
    }
  });

  ws.on('close', () => {
    liveConnectionsCount = Math.max(0, liveConnectionsCount - 1);
    if (targetSocket && !targetSocket.destroyed) {
      targetSocket.destroy();
    }
    saveDatabase();
  });

  ws.on('error', () => {
    if (targetSocket && !targetSocket.destroyed) {
      targetSocket.destroy();
    }
  });
}

// WebSocket Server Router
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url ? request.url.split('?')[0] : '';

  // VLESS endpoints
  if (pathname === '/vless-ws' || pathname === '/vless-wasmer' || pathname.startsWith('/vless')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleVlessConnection(ws, request);
    });
  }
  // Trojan endpoints
  else if (pathname === '/trojan-ws' || pathname === '/trojan-wasmer' || pathname.startsWith('/trojan')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleTrojanConnection(ws, request);
    });
  }
});

// ==========================================
// 3. ADMIN AUTHENTICATION MIDDLEWARE
// ==========================================
function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const session = activeSessions.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (session) activeSessions.delete(token);
    return res.status(401).json({ success: false, error: 'Session expired or invalid' });
  }

  // Extend session by 2 hours on active requests
  session.expiresAt = Date.now() + 2 * 3600 * 1000;
  next();
}

// Auth API Endpoints
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  const validUser = ADMIN_USER;
  const isMatch = username === validUser && password === ADMIN_PASS;

  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  const token = `adm_${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = Date.now() + 24 * 3600 * 1000; // 24 hours

  activeSessions.set(token, { username, expiresAt });

  res.json({
    success: true,
    token,
    username,
    expiresAt: new Date(expiresAt).toISOString()
  });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out' });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }
  const token = authHeader.split(' ')[1];
  const session = activeSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true, username: session.username });
});

app.post('/api/auth/change-password', requireAdminAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (oldPassword !== ADMIN_PASS) {
    return res.status(400).json({ success: false, message: 'Old password is incorrect' });
  }
  if (!newPassword || newPassword.length < 5) {
    return res.status(400).json({ success: false, message: 'Password must be at least 5 characters' });
  }
  ADMIN_PASS = newPassword;
  res.json({ success: true, message: 'Password changed successfully' });
});

// ==========================================
// 4. SUBSCRIPTION ENDPOINT (MAHSANG / V2RAYNG)
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

  // Auto-detect hostname from incoming request (supports Wasmer, Railway, or custom domains)
  const incomingHost = req.headers.host || 'my-app.wasmer.app';
  const cleanHost = incomingHost.split(':')[0];

  // Personalize configs for this user
  const personalizedConfigs = generateUserPersonalizedConfigs(user, db.configs, cleanHost);

  // Headers for MahsaNG / V2rayNG / Clash
  const expireTimestamp = Math.floor(new Date(user.expireAt).getTime() / 1000);
  res.setHeader(
    'Subscription-Userinfo',
    `upload=${user.usedUploadBytes}; download=${user.usedDownloadBytes}; total=${maxBytes}; expire=${expireTimestamp}`
  );
  res.setHeader('Profile-Update-Interval', '6'); // Refresh every 6 hours
  res.setHeader('Profile-Title', `Shirin-RayPanel: ${user.username}`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (isExpired || isQuotaExceeded) {
    const alertMsg = isExpired ? '⚠️ Subscription Expired' : '⚠️ Data Quota Exceeded';
    const alertConfig: ProxyConfig = {
      id: 'alert-expired-node',
      name: alertMsg,
      protocol: 'http',
      server: '127.0.0.1',
      port: 80,
      transport: 'tcp',
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

  // Base64 Subscription string for MahsaNG
  const base64Sub = generateSubscriptionBase64(personalizedConfigs);
  res.send(base64Sub);
});

// ==========================================
// 5. PROTECTED ADMIN MANAGEMENT APIS
// ==========================================

// --- Configs API ---
app.get('/api/configs', requireAdminAuth, (req, res) => {
  res.json({ configs: db.configs });
});

app.post('/api/configs', requireAdminAuth, (req, res) => {
  const newConfig: ProxyConfig = {
    ...req.body,
    id: req.body.id || `cfg-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  db.configs.unshift(newConfig);
  saveDatabase();
  res.json({ success: true, config: newConfig });
});

app.put('/api/configs/:id', requireAdminAuth, (req, res) => {
  const id = req.params.id;
  const index = db.configs.findIndex(c => c.id === id);
  if (index === -1) return res.status(404).json({ error: 'Config not found' });

  db.configs[index] = { ...db.configs[index], ...req.body };
  saveDatabase();
  res.json({ success: true, config: db.configs[index] });
});

app.delete('/api/configs/:id', requireAdminAuth, (req, res) => {
  db.configs = db.configs.filter(c => c.id !== req.params.id);
  saveDatabase();
  res.json({ success: true });
});

// --- Users API ---
app.get('/api/users', requireAdminAuth, (req, res) => {
  res.json({ users: db.users });
});

app.post('/api/users', requireAdminAuth, (req, res) => {
  const randomUuid = crypto.randomUUID();
  const randomSubToken = `sub_${crypto.randomBytes(6).toString('hex')}`;
  const randomPassword = `pass_${crypto.randomBytes(5).toString('hex')}`;

  const newUser: UserAccount = {
    ...req.body,
    id: req.body.id || `usr-${Date.now()}`,
    uuid: req.body.uuid || randomUuid,
    token: req.body.token || randomSubToken,
    trojanPassword: req.body.trojanPassword || randomPassword,
    usedUploadBytes: req.body.usedUploadBytes || 0,
    usedDownloadBytes: req.body.usedDownloadBytes || 0,
    createdAt: new Date().toISOString(),
  };
  db.users.unshift(newUser);
  saveDatabase();
  res.json({ success: true, user: newUser });
});

app.put('/api/users/:id', requireAdminAuth, (req, res) => {
  const id = req.params.id;
  const index = db.users.findIndex(u => u.id === id);
  if (index === -1) return res.status(404).json({ error: 'User not found' });

  db.users[index] = { ...db.users[index], ...req.body };
  saveDatabase();
  res.json({ success: true, user: db.users[index] });
});

app.delete('/api/users/:id', requireAdminAuth, (req, res) => {
  db.users = db.users.filter(u => u.id !== req.params.id);
  saveDatabase();
  res.json({ success: true });
});

app.post('/api/users/:id/reset-traffic', requireAdminAuth, (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.usedUploadBytes = 0;
  user.usedDownloadBytes = 0;
  saveDatabase();
  res.json({ success: true, user });
});

// --- Clean IP API ---
app.get('/api/clean-ips', requireAdminAuth, (req, res) => {
  res.json({ cleanIps: db.cleanIps });
});

app.post('/api/clean-ips', requireAdminAuth, (req, res) => {
  const newIp: CleanIpEntry = {
    ...req.body,
    id: req.body.id || `cip-${Date.now()}`,
    addedAt: new Date().toISOString(),
    active: req.body.active !== undefined ? req.body.active : true
  };
  db.cleanIps.unshift(newIp);
  saveDatabase();
  res.json({ success: true, cleanIp: newIp });
});

app.put('/api/clean-ips/:id', requireAdminAuth, (req, res) => {
  const index = db.cleanIps.findIndex(ip => ip.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'IP not found' });
  db.cleanIps[index] = { ...db.cleanIps[index], ...req.body };
  saveDatabase();
  res.json({ success: true, cleanIp: db.cleanIps[index] });
});

app.delete('/api/clean-ips/:id', requireAdminAuth, (req, res) => {
  db.cleanIps = db.cleanIps.filter(ip => ip.id !== req.params.id);
  saveDatabase();
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
    saveDatabase();
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

  const stats: SystemStats = {
    totalConfigs: db.configs.length,
    activeConfigs: db.configs.filter(c => c.active).length,
    totalUsers: db.users.length,
    activeUsers: db.users.filter(u => u.active).length,
    totalTrafficGB: Math.round((totalTrafficBytes / (1024 * 1024 * 1024)) * 10) / 10,
    usedTrafficGB: Math.round((usedTrafficBytes / (1024 * 1024 * 1024)) * 100) / 100,
    todayTrafficMB: Math.round(((realTotalUploadBytes + realTotalDownloadBytes) / (1024 * 1024)) * 10) / 10,
    liveConnections: liveConnectionsCount,
    totalConnectionsServed,
    liveUploadSpeedBps,
    liveDownloadSpeedBps
  };

  res.json({ stats });
});

// --- Database Export / Import ---
app.get('/api/database/export', requireAdminAuth, (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename=raypanel-database-${new Date().toISOString().slice(0, 10)}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(db, null, 2));
});

app.post('/api/database/import', requireAdminAuth, (req, res) => {
  try {
    const imported = req.body;
    if (imported && Array.isArray(imported.configs) && Array.isArray(imported.users)) {
      db = {
        ...db,
        ...imported,
        cleanIps: Array.isArray(imported.cleanIps) ? imported.cleanIps : db.cleanIps,
      };
      saveDatabase();
      return res.json({ success: true, message: 'Database imported successfully' });
    }
    res.status(400).json({ success: false, message: 'Invalid database schema' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Import failed' });
  }
});

// ==========================================
// 6. FRONTEND SERVING (VITE SPA & PRODUCTION)
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Shirin / RayPanel Server running on http://0.0.0.0:${PORT}`);
    console.log(`📡 VLESS WS Endpoint: ws://0.0.0.0:${PORT}/vless-ws`);
    console.log(`📡 Trojan WS Endpoint: ws://0.0.0.0:${PORT}/trojan-ws`);
  });
}

startServer();
