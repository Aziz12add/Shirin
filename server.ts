import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { ProxyConfig, UserAccount, TrafficRecord, DatabaseSettings } from './src/types';
import { generateSubscriptionBase64, generateConfigUri } from './src/utils/configParsers';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Path to JSON data store
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial seed data
const defaultConfigs: ProxyConfig[] = [
  {
    id: 'cfg-vless-wasmer-1',
    name: 'Wasmer Edge VLESS-WS (همراه اول / MCI)',
    protocol: 'vless',
    server: 'my-app.wasmer.app',
    port: 443,
    uuid: 'e7b1a23c-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
    transport: 'ws',
    path: '/vless-wasmer',
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
    id: 'cfg-trojan-wasmer-2',
    name: 'Wasmer Edge Trojan-WS (ایرانسل / Irancell)',
    protocol: 'trojan',
    server: 'my-app.wasmer.app',
    port: 443,
    password: 'WasmerPass_2026_SecureKey',
    transport: 'ws',
    path: '/trojan-wasmer',
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
    id: 'cfg-vless-railway-1',
    name: 'Railway VLESS-WS (MCI / همراه اول)',
    protocol: 'vless',
    server: 'my-app.up.railway.app',
    port: 443,
    uuid: 'e7b1a23c-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
    transport: 'ws',
    path: '/vless-railway',
    host: 'my-app.up.railway.app',
    sni: 'my-app.up.railway.app',
    security: 'tls',
    remark: '🇮🇷 Railway VLESS WS-TLS ⚡ MCI',
    operatorPreset: 'mci',
    cleanIp: '104.16.132.229',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cfg-trojan-railway-2',
    name: 'Railway Trojan-WS (Irancell / ایرانسل)',
    protocol: 'trojan',
    server: 'my-app.up.railway.app',
    port: 443,
    password: 'RailwayPass_2026_SecureKey',
    transport: 'ws',
    path: '/trojan-railway',
    host: 'my-app.up.railway.app',
    sni: 'my-app.up.railway.app',
    security: 'tls',
    remark: '🇮🇷 Railway Trojan WS-TLS 🚀 Irancell',
    operatorPreset: 'irancell',
    cleanIp: '162.159.136.232',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cfg-vless-reality-3',
    name: 'VLESS Reality TCP Direct',
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
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cfg-http-proxy-4',
    name: 'HTTP Secure Proxy (Auth)',
    protocol: 'http',
    server: 'my-app.up.railway.app',
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
    quotaGB: 50,
    usedUploadBytes: 1024 * 1024 * 450, // 450 MB
    usedDownloadBytes: 1024 * 1024 * 1024 * 8.4, // 8.4 GB
    expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    active: true,
    allowedConfigs: ['all'],
    notes: 'اکانت اختصاصی روزمره - مهسا آن‌جی',
    createdAt: new Date().toISOString(),
    lastConnectedAt: new Date().toISOString(),
  },
  {
    id: 'usr-family-2',
    username: 'daily_user',
    email: 'user@example.com',
    token: 'sub_daily_user_334455',
    quotaGB: 20,
    usedUploadBytes: 1024 * 1024 * 120,
    usedDownloadBytes: 1024 * 1024 * 1024 * 3.2,
    expireAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    active: true,
    allowedConfigs: ['cfg-vless-railway-1', 'cfg-trojan-railway-2'],
    notes: 'کانفیگ‌های ریلوی',
    createdAt: new Date().toISOString(),
    lastConnectedAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
  }
];

interface DatabaseSchema {
  configs: ProxyConfig[];
  users: UserAccount[];
  traffic: TrafficRecord[];
  settings: DatabaseSettings;
}

// In-Memory Database initialized with disk or defaults
let db: DatabaseSchema = {
  configs: defaultConfigs,
  users: defaultUsers,
  traffic: [],
  settings: {
    type: 'local_json',
    status: 'connected',
    autoBackup: true,
    lastSynced: new Date().toISOString(),
  }
};

// Load database from disk if present
function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.configs && Array.isArray(parsed.configs)) {
        db = parsed;
        console.log('Database loaded successfully from file.');
      }
    } else {
      saveDatabase();
    }
  } catch (err) {
    console.error('Error loading database, using memory fallback:', err);
  }
}

// Persist database to disk
function saveDatabase() {
  try {
    db.settings.lastSynced = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database to file:', err);
  }
}

loadDatabase();

// ==========================================
// 1. SUBSCRIPTION ENDPOINTS (FOR MAHSANG / V2RAYNG)
// ==========================================

// Standard Subscription Handler
const handleSubscription = (req: express.Request, res: express.Response) => {
  const token = req.params.token;
  const user = db.users.find(u => u.token === token);

  if (!user) {
    return res.status(404).send('Subscription not found. Invalid Token.');
  }

  if (!user.active) {
    return res.status(403).send('Account is suspended or disabled.');
  }

  const isExpired = new Date(user.expireAt).getTime() < Date.now();
  const totalUsedBytes = user.usedUploadBytes + user.usedDownloadBytes;
  const maxBytes = user.quotaGB * 1024 * 1024 * 1024;
  const isQuotaExceeded = totalUsedBytes >= maxBytes;

  // Filter allowed configs
  let matchedConfigs = db.configs.filter(c => c.active);
  if (!user.allowedConfigs.includes('all')) {
    matchedConfigs = matchedConfigs.filter(c => user.allowedConfigs.includes(c.id));
  }

  // Update user last access & simulate slight sync traffic
  user.lastConnectedAt = new Date().toISOString();
  saveDatabase();

  // Set standard Subscription headers (v2ray / MahsaNG / Clash compatible)
  const expireTimestamp = Math.floor(new Date(user.expireAt).getTime() / 1000);
  res.setHeader(
    'Subscription-Userinfo',
    `upload=${user.usedUploadBytes}; download=${user.usedDownloadBytes}; total=${maxBytes}; expire=${expireTimestamp}`
  );
  res.setHeader('Profile-Update-Interval', '12'); // 12 hours refresh
  res.setHeader('Profile-Title', `RayPanel: ${user.username}`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (isExpired || isQuotaExceeded) {
    // If expired/exceeded, return informative warning node or empty
    const alertMsg = isExpired ? '⚠️ Subscription Expired' : '⚠️ Data Quota Exceeded';
    const dummyConfig: ProxyConfig = {
      id: 'alert-node',
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
    return res.send(generateSubscriptionBase64([dummyConfig]));
  }

  const format = req.query.format as string;
  if (format === 'raw') {
    const rawList = matchedConfigs.map(generateConfigUri).join('\n');
    return res.send(rawList);
  }

  // Default: Base64 string list of URIs for MahsaNG / V2rayNG
  const base64Sub = generateSubscriptionBase64(matchedConfigs);
  return res.send(base64Sub);
};

app.get('/sub/:token', handleSubscription);
app.get('/api/sub/:token', handleSubscription);

// ==========================================
// 2. CONFIGURATIONS API
// ==========================================

app.get('/api/configs', (req, res) => {
  res.json({ success: true, configs: db.configs });
});

app.post('/api/configs', (req, res) => {
  const newConfig: ProxyConfig = {
    ...req.body,
    id: req.body.id || `cfg-${Date.now()}`,
    createdAt: req.body.createdAt || new Date().toISOString(),
    active: req.body.active !== undefined ? req.body.active : true,
  };

  db.configs.unshift(newConfig);
  saveDatabase();
  res.json({ success: true, config: newConfig });
});

app.put('/api/configs/:id', (req, res) => {
  const { id } = req.params;
  const index = db.configs.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Config not found' });
  }

  db.configs[index] = { ...db.configs[index], ...req.body };
  saveDatabase();
  res.json({ success: true, config: db.configs[index] });
});

app.delete('/api/configs/:id', (req, res) => {
  const { id } = req.params;
  db.configs = db.configs.filter(c => c.id !== id);
  saveDatabase();
  res.json({ success: true, message: 'Config deleted' });
});

// ==========================================
// 3. USER MANAGEMENT API
// ==========================================

app.get('/api/users', (req, res) => {
  res.json({ success: true, users: db.users });
});

app.post('/api/users', (req, res) => {
  const token = req.body.token || `sub_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
  const newUser: UserAccount = {
    id: req.body.id || `usr-${Date.now()}`,
    username: req.body.username || 'user_' + Math.floor(Math.random() * 1000),
    email: req.body.email || '',
    token,
    quotaGB: Number(req.body.quotaGB) || 30,
    usedUploadBytes: 0,
    usedDownloadBytes: 0,
    expireAt: req.body.expireAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    active: req.body.active !== undefined ? req.body.active : true,
    allowedConfigs: req.body.allowedConfigs || ['all'],
    notes: req.body.notes || '',
    createdAt: new Date().toISOString(),
  };

  db.users.unshift(newUser);
  saveDatabase();
  res.json({ success: true, user: newUser });
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const index = db.users.findIndex(u => u.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  db.users[index] = { ...db.users[index], ...req.body };
  saveDatabase();
  res.json({ success: true, user: db.users[index] });
});

app.post('/api/users/:id/reset-traffic', (req, res) => {
  const { id } = req.params;
  const user = db.users.find(u => u.id === id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  user.usedUploadBytes = 0;
  user.usedDownloadBytes = 0;
  saveDatabase();
  res.json({ success: true, user });
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  db.users = db.users.filter(u => u.id !== id);
  saveDatabase();
  res.json({ success: true, message: 'User deleted' });
});

// ==========================================
// 4. TRAFFIC LOGGING & SYSTEM STATS API
// ==========================================

app.post('/api/traffic/log', (req, res) => {
  const { userId, uploadMB = 0, downloadMB = 0, configId } = req.body;
  const user = db.users.find(u => u.id === userId);
  if (user) {
    const uploadBytes = Number(uploadMB) * 1024 * 1024;
    const downloadBytes = Number(downloadMB) * 1024 * 1024;
    user.usedUploadBytes += uploadBytes;
    user.usedDownloadBytes += downloadBytes;
    user.lastConnectedAt = new Date().toISOString();

    db.traffic.push({
      id: `trf-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      userId,
      configId: configId || 'general',
      uploadBytes,
      downloadBytes,
    });

    // Keep max 500 traffic history records
    if (db.traffic.length > 500) {
      db.traffic = db.traffic.slice(-500);
    }

    saveDatabase();
  }
  res.json({ success: true, user });
});

app.get('/api/stats', (req, res) => {
  const totalConfigs = db.configs.length;
  const activeConfigs = db.configs.filter(c => c.active).length;
  const totalUsers = db.users.length;
  const activeUsers = db.users.filter(u => u.active).length;

  let totalQuotaBytes = 0;
  let usedBytes = 0;

  db.users.forEach(u => {
    totalQuotaBytes += (u.quotaGB || 0) * 1024 * 1024 * 1024;
    usedBytes += (u.usedUploadBytes || 0) + (u.usedDownloadBytes || 0);
  });

  const totalTrafficGB = parseFloat((totalQuotaBytes / (1024 * 1024 * 1024)).toFixed(2));
  const usedTrafficGB = parseFloat((usedBytes / (1024 * 1024 * 1024)).toFixed(2));

  res.json({
    success: true,
    stats: {
      totalConfigs,
      activeConfigs,
      totalUsers,
      activeUsers,
      totalTrafficGB,
      usedTrafficGB,
      trafficHistory: db.traffic.slice(-24),
      settings: db.settings
    }
  });
});

// ==========================================
// 5. DATABASE EXPORT & BACKUP API
// ==========================================

app.get('/api/database/export', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="raypanel-backup.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(db, null, 2));
});

app.post('/api/database/import', (req, res) => {
  try {
    const importedData = req.body;
    if (importedData && Array.isArray(importedData.configs) && Array.isArray(importedData.users)) {
      db = {
        configs: importedData.configs,
        users: importedData.users,
        traffic: importedData.traffic || [],
        settings: importedData.settings || db.settings
      };
      saveDatabase();
      return res.json({ success: true, message: 'Data imported successfully' });
    }
    return res.status(400).json({ success: false, message: 'Invalid data format' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Import failed' });
  }
});

app.post('/api/database/settings', (req, res) => {
  db.settings = { ...db.settings, ...req.body, status: 'connected', lastSynced: new Date().toISOString() };
  saveDatabase();
  res.json({ success: true, settings: db.settings });
});

// ==========================================
// 6. VITE MIDDLEWARE & SERVER STARTUP
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 RayPanel server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
