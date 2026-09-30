import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { 
  ProxyConfig, 
  UserAccount, 
  CleanIpEntry, 
  TrafficRecord, 
  DatabaseSettings 
} from '../types';

export interface PersistentStorageSchema {
  configs: ProxyConfig[];
  users: UserAccount[];
  cleanIps: CleanIpEntry[];
  traffic: TrafficRecord[];
  settings: DatabaseSettings;
  adminPasswordHash: string;
  adminUsername: string;
  lifetimeUploadBytes: number;
  lifetimeDownloadBytes: number;
  sessions: { [token: string]: { username: string; expiresAt: number } };
}

export interface PersistenceAdapter {
  init(): Promise<void>;
  isReady(): boolean;
  load(): Promise<PersistentStorageSchema>;
  save(data: PersistentStorageSchema, force?: boolean): Promise<boolean>;
  getStats(): { type: string; status: 'connected' | 'disconnected' | 'syncing'; details?: string };
  close(): Promise<void>;
}

// Default Clean IPs for initial seeding if empty
export const defaultInitialCleanIps: CleanIpEntry[] = [
  {
    id: 'cip-mci-1',
    ip: '104.16.132.229',
    operator: 'mci',
    name: 'MCI Cloudflare Anycast 1',
    ispNameFa: 'همراه اول (تهران / شیراز)',
    pingMs: 42,
    active: true,
    addedAt: '2026-01-01T00:00:00.000Z',
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
    addedAt: '2026-01-01T00:00:00.000Z',
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
    addedAt: '2026-01-01T00:00:00.000Z',
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
    addedAt: '2026-01-01T00:00:00.000Z',
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
    addedAt: '2026-01-01T00:00:00.000Z',
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
    addedAt: '2026-01-01T00:00:00.000Z',
    notes: 'تست شده روی ADSL و فیبر نوری تانوما'
  }
];

// Helper to create a single seed state if completely fresh with deterministic, non-regenerating credentials
export function createSeedData(adminUsername: string, adminPasswordHash: string): PersistentStorageSchema {
  const seedUuid = crypto.randomUUID();
  const seedTrojanPass = `Pass_${crypto.randomBytes(6).toString('hex')}`;
  const seedSubToken = `sub_${crypto.randomBytes(8).toString('hex')}`;

  const seedConfigs: ProxyConfig[] = [
    {
      id: 'cfg-vless-ws-1',
      name: 'Wasmer VLESS-WS (همراه اول / MCI)',
      protocol: 'vless',
      server: 'my-app.wasmer.app',
      port: 443,
      uuid: seedUuid,
      transport: 'ws',
      path: '/vless-ws',
      host: 'my-app.wasmer.app',
      sni: 'my-app.wasmer.app',
      security: 'tls',
      remark: '⚡ Wasmer VLESS WS-TLS 🇮🇷 MCI',
      operatorPreset: 'mci',
      cleanIp: '104.16.132.229',
      useCleanIp: false,
      fragment: true,
      fragmentLength: '10-50',
      fragmentInterval: '20-50',
      fragmentPackets: 'tlshello',
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'cfg-trojan-ws-2',
      name: 'Wasmer Trojan-WS (ایرانسل / Irancell)',
      protocol: 'trojan',
      server: 'my-app.wasmer.app',
      port: 443,
      password: seedTrojanPass,
      transport: 'ws',
      path: '/trojan-ws',
      host: 'my-app.wasmer.app',
      sni: 'my-app.wasmer.app',
      security: 'tls',
      remark: '🚀 Wasmer Trojan WS-TLS 🇮🇷 Irancell',
      operatorPreset: 'irancell',
      cleanIp: '162.159.136.232',
      useCleanIp: false,
      active: true,
      createdAt: new Date().toISOString(),
    }
  ];

  const seedUsers: UserAccount[] = [
    {
      id: 'usr-admin-1',
      username: 'soshiant_vip',
      email: 'soshiant@example.com',
      token: seedSubToken,
      uuid: seedUuid,
      trojanPassword: seedTrojanPass,
      quotaGB: 60,
      usedUploadBytes: 0,
      usedDownloadBytes: 0,
      expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      active: true,
      allowedConfigs: ['all'],
      notes: 'اکانت اختصاصی VIP مهسا آن‌جی',
      createdAt: new Date().toISOString(),
      lastConnectedAt: new Date().toISOString(),
    }
  ];

  return {
    configs: seedConfigs,
    users: seedUsers,
    cleanIps: defaultInitialCleanIps,
    traffic: [],
    settings: {
      type: 'local_json',
      autoBackup: true,
      lastBackupAt: new Date().toISOString(),
      status: 'connected',
      lastSynced: new Date().toISOString(),
      adminUsername
    },
    adminPasswordHash,
    adminUsername,
    lifetimeUploadBytes: 0,
    lifetimeDownloadBytes: 0,
    sessions: {}
  };
}

// ==========================================
// 1. JSON FILE PERSISTENCE ADAPTER
// ==========================================
export class JsonFilePersistenceAdapter implements PersistenceAdapter {
  private dataDir: string;
  private dbFile: string;
  private backupFile: string;
  private ready = false;
  private isSaving = false;
  private defaultAdminUser: string;
  private defaultAdminHash: string;

  constructor(dataDir: string, defaultAdminUser: string, defaultAdminHash: string) {
    this.dataDir = dataDir;
    this.dbFile = path.join(dataDir, 'database.json');
    this.backupFile = path.join(dataDir, 'database.bak.json');
    this.defaultAdminUser = defaultAdminUser;
    this.defaultAdminHash = defaultAdminHash;
  }

  async init(): Promise<void> {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      this.ready = true;
    } catch (err: any) {
      this.ready = false;
      throw new Error(`Failed to initialize JSON database directory: ${err.message}`);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  getStats() {
    return {
      type: 'local_json',
      status: (this.ready ? 'connected' : 'disconnected') as any,
      details: this.dbFile
    };
  }

  async load(): Promise<PersistentStorageSchema> {
    if (fs.existsSync(this.dbFile)) {
      try {
        const raw = fs.readFileSync(this.dbFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.configs) && Array.isArray(parsed.users)) {
          return this.normalizeSchema(parsed);
        }
      } catch (err) {
        console.error('⚠️ Primary JSON corrupted, reading backup...', err);
        if (fs.existsSync(this.backupFile)) {
          const rawBak = fs.readFileSync(this.backupFile, 'utf-8');
          const parsedBak = JSON.parse(rawBak);
          return this.normalizeSchema(parsedBak);
        }
      }
    }

    // First run initialization: Create atomic seed data and persist immediately
    console.log('🌱 Initializing brand new database with permanent seed credentials...');
    const seed = createSeedData(this.defaultAdminUser, this.defaultAdminHash);
    await this.save(seed, true);
    return seed;
  }

  private normalizeSchema(raw: any): PersistentStorageSchema {
    return {
      configs: Array.isArray(raw.configs) ? raw.configs : [],
      users: Array.isArray(raw.users) ? raw.users : [],
      cleanIps: Array.isArray(raw.cleanIps) && raw.cleanIps.length > 0 ? raw.cleanIps : defaultInitialCleanIps,
      traffic: Array.isArray(raw.traffic) ? raw.traffic : [],
      settings: raw.settings || {
        type: 'local_json',
        autoBackup: true,
        status: 'connected',
        lastSynced: new Date().toISOString(),
        adminUsername: this.defaultAdminUser
      },
      adminPasswordHash: raw.adminPasswordHash || this.defaultAdminHash,
      adminUsername: raw.adminUsername || this.defaultAdminUser,
      lifetimeUploadBytes: typeof raw.lifetimeUploadBytes === 'number' ? raw.lifetimeUploadBytes : 0,
      lifetimeDownloadBytes: typeof raw.lifetimeDownloadBytes === 'number' ? raw.lifetimeDownloadBytes : 0,
      sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {}
    };
  }

  async save(data: PersistentStorageSchema, force = false): Promise<boolean> {
    if (this.isSaving && !force) return false;
    this.isSaving = true;

    try {
      // Keep traffic log bounded to avoid heap exhaustion on constrained runtime
      if (data.traffic.length > 100) {
        data.traffic = data.traffic.slice(-100);
      }
      data.settings.lastSynced = new Date().toISOString();

      const jsonStr = JSON.stringify(data);
      const tmpFile = `${this.dbFile}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;

      fs.writeFileSync(tmpFile, jsonStr, 'utf-8');
      fs.renameSync(tmpFile, this.dbFile);
      fs.writeFileSync(this.backupFile, jsonStr, 'utf-8');
      return true;
    } catch (err: any) {
      console.error('❌ Failed to save JSON database:', err?.message || err);
      return false;
    } finally {
      this.isSaving = false;
    }
  }

  async close(): Promise<void> {
    this.ready = false;
  }
}

// ==========================================
// 2. MANAGED POSTGRESQL PERSISTENCE ADAPTER (WASMER / CLOUD)
// ==========================================
export class PostgresPersistenceAdapter implements PersistenceAdapter {
  private pool: pg.Pool | null = null;
  private connectionString: string;
  private ready = false;
  private defaultAdminUser: string;
  private defaultAdminHash: string;

  constructor(connectionString: string, defaultAdminUser: string, defaultAdminHash: string) {
    this.connectionString = connectionString;
    this.defaultAdminUser = defaultAdminUser;
    this.defaultAdminHash = defaultAdminHash;
  }

  async init(): Promise<void> {
    this.pool = new pg.Pool({
      connectionString: this.connectionString,
      ssl: this.connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      max: 10,
    });

    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      await this.runIdempotentMigrations(client);
      this.ready = true;
      console.log('✅ PostgreSQL managed database connected and migrations verified.');
    } finally {
      client.release();
    }
  }

  isReady(): boolean {
    return this.ready && this.pool !== null;
  }

  getStats() {
    return {
      type: 'postgres',
      status: (this.ready ? 'connected' : 'disconnected') as any,
      details: 'PostgreSQL instance'
    };
  }

  private async runIdempotentMigrations(client: pg.PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS shirin_users (
        id VARCHAR(100) PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255),
        token VARCHAR(100) NOT NULL UNIQUE,
        uuid VARCHAR(100),
        trojan_password VARCHAR(100),
        quota_gb DOUBLE PRECISION DEFAULT 30,
        used_upload_bytes BIGINT DEFAULT 0,
        used_download_bytes BIGINT DEFAULT 0,
        expire_at TIMESTAMPTZ,
        active BOOLEAN DEFAULT true,
        allowed_configs JSONB DEFAULT '["all"]'::jsonb,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_connected_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS shirin_configs (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        protocol VARCHAR(50) NOT NULL,
        server VARCHAR(255) NOT NULL,
        port INT NOT NULL,
        uuid VARCHAR(100),
        password VARCHAR(255),
        username VARCHAR(255),
        transport VARCHAR(50) DEFAULT 'ws',
        path VARCHAR(255),
        host VARCHAR(255),
        sni VARCHAR(255),
        security VARCHAR(50) DEFAULT 'tls',
        alpn VARCHAR(100),
        flow VARCHAR(100),
        reality_public_key VARCHAR(255),
        reality_short_id VARCHAR(100),
        spider_x VARCHAR(255),
        remark VARCHAR(255),
        operator_preset VARCHAR(50),
        clean_ip VARCHAR(255),
        use_clean_ip BOOLEAN DEFAULT false,
        fragment BOOLEAN DEFAULT false,
        fragment_length VARCHAR(50),
        fragment_interval VARCHAR(50),
        fragment_packets VARCHAR(50),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shirin_clean_ips (
        id VARCHAR(100) PRIMARY KEY,
        ip VARCHAR(100) NOT NULL,
        operator VARCHAR(50) NOT NULL,
        name VARCHAR(255),
        isp_name_fa VARCHAR(255),
        ping_ms INT,
        active BOOLEAN DEFAULT true,
        added_at TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS shirin_traffic (
        id VARCHAR(100) PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        user_id VARCHAR(100),
        config_id VARCHAR(100),
        upload_bytes BIGINT NOT NULL,
        download_bytes BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shirin_meta (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shirin_sessions (
        token VARCHAR(128) PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        expires_at BIGINT NOT NULL
      );
    `);
  }

  async load(): Promise<PersistentStorageSchema> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();

    try {
      const usersRes = await client.query('SELECT * FROM shirin_users ORDER BY created_at ASC');
      const configsRes = await client.query('SELECT * FROM shirin_configs ORDER BY created_at DESC');
      const cleanIpsRes = await client.query('SELECT * FROM shirin_clean_ips ORDER BY added_at ASC');
      const trafficRes = await client.query('SELECT * FROM shirin_traffic ORDER BY timestamp DESC LIMIT 100');
      const metaRes = await client.query('SELECT key, value FROM shirin_meta');
      const sessionsRes = await client.query('SELECT token, username, expires_at FROM shirin_sessions WHERE expires_at > $1', [Date.now()]);

      const metaMap: { [k: string]: any } = {};
      metaRes.rows.forEach(r => { metaMap[r.key] = r.value; });

      const sessionsMap: { [token: string]: { username: string; expiresAt: number } } = {};
      sessionsRes.rows.forEach(r => {
        sessionsMap[r.token] = { username: r.username, expiresAt: Number(r.expires_at) };
      });

      // If database is brand new (empty users and configs), seed it immediately
      if (usersRes.rows.length === 0 && configsRes.rows.length === 0) {
        console.log('🌱 Seeding fresh PostgreSQL database with permanent initial records...');
        const seed = createSeedData(this.defaultAdminUser, this.defaultAdminHash);
        await this.save(seed, true);
        return seed;
      }

      const users: UserAccount[] = usersRes.rows.map(r => ({
        id: r.id,
        username: r.username,
        email: r.email || undefined,
        token: r.token,
        uuid: r.uuid || undefined,
        trojanPassword: r.trojan_password || undefined,
        quotaGB: Number(r.quota_gb),
        usedUploadBytes: Number(r.used_upload_bytes),
        usedDownloadBytes: Number(r.used_download_bytes),
        expireAt: r.expire_at ? new Date(r.expire_at).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
        active: Boolean(r.active),
        allowedConfigs: Array.isArray(r.allowed_configs) ? r.allowed_configs : ['all'],
        notes: r.notes || undefined,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        lastConnectedAt: r.last_connected_at ? new Date(r.last_connected_at).toISOString() : undefined,
      }));

      const configs: ProxyConfig[] = configsRes.rows.map(r => ({
        id: r.id,
        name: r.name,
        protocol: r.protocol,
        server: r.server,
        port: Number(r.port),
        uuid: r.uuid || undefined,
        password: r.password || undefined,
        username: r.username || undefined,
        transport: r.transport,
        path: r.path || undefined,
        host: r.host || undefined,
        sni: r.sni || undefined,
        security: r.security,
        alpn: r.alpn || undefined,
        flow: r.flow || undefined,
        realityPublicKey: r.reality_public_key || undefined,
        realityShortId: r.reality_short_id || undefined,
        spiderX: r.spider_x || undefined,
        remark: r.remark || '',
        operatorPreset: r.operator_preset || undefined,
        cleanIp: r.clean_ip || undefined,
        useCleanIp: Boolean(r.use_clean_ip),
        fragment: Boolean(r.fragment),
        fragmentLength: r.fragment_length || undefined,
        fragmentInterval: r.fragment_interval || undefined,
        fragmentPackets: r.fragment_packets || undefined,
        active: Boolean(r.active),
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      }));

      const cleanIps: CleanIpEntry[] = cleanIpsRes.rows.length > 0 ? cleanIpsRes.rows.map(r => ({
        id: r.id,
        ip: r.ip,
        operator: r.operator,
        name: r.name,
        ispNameFa: r.isp_name_fa,
        pingMs: r.ping_ms !== null ? Number(r.ping_ms) : undefined,
        active: Boolean(r.active),
        addedAt: r.added_at ? new Date(r.added_at).toISOString() : new Date().toISOString(),
        notes: r.notes || undefined,
      })) : defaultInitialCleanIps;

      const traffic: TrafficRecord[] = trafficRes.rows.map(r => ({
        id: r.id,
        timestamp: new Date(r.timestamp).toISOString(),
        userId: r.user_id,
        configId: r.config_id,
        uploadBytes: Number(r.upload_bytes),
        downloadBytes: Number(r.download_bytes)
      }));

      return {
        configs,
        users,
        cleanIps,
        traffic,
        settings: {
          type: 'postgres',
          connectionString: this.connectionString,
          autoBackup: true,
          status: 'connected',
          lastSynced: new Date().toISOString(),
          adminUsername: metaMap.adminUsername || this.defaultAdminUser
        },
        adminPasswordHash: metaMap.adminPasswordHash || this.defaultAdminHash,
        adminUsername: metaMap.adminUsername || this.defaultAdminUser,
        lifetimeUploadBytes: Number(metaMap.lifetimeUploadBytes || 0),
        lifetimeDownloadBytes: Number(metaMap.lifetimeDownloadBytes || 0),
        sessions: sessionsMap
      };
    } finally {
      client.release();
    }
  }

  async save(data: PersistentStorageSchema, _force?: boolean): Promise<boolean> {
    if (!this.pool) return false;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Sync Users with UPSERT
      for (const u of data.users) {
        await client.query(`
          INSERT INTO shirin_users (id, username, email, token, uuid, trojan_password, quota_gb, used_upload_bytes, used_download_bytes, expire_at, active, allowed_configs, notes, created_at, last_connected_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            email = EXCLUDED.email,
            token = EXCLUDED.token,
            uuid = EXCLUDED.uuid,
            trojan_password = EXCLUDED.trojan_password,
            quota_gb = EXCLUDED.quota_gb,
            used_upload_bytes = EXCLUDED.used_upload_bytes,
            used_download_bytes = EXCLUDED.used_download_bytes,
            expire_at = EXCLUDED.expire_at,
            active = EXCLUDED.active,
            allowed_configs = EXCLUDED.allowed_configs,
            notes = EXCLUDED.notes,
            last_connected_at = EXCLUDED.last_connected_at
        `, [
          u.id, u.username, u.email || null, u.token, u.uuid || null, u.trojanPassword || null,
          u.quotaGB, u.usedUploadBytes, u.usedDownloadBytes, u.expireAt, u.active,
          JSON.stringify(u.allowedConfigs), u.notes || null, u.createdAt, u.lastConnectedAt || null
        ]);
      }
      // Delete users removed from schema
      const userIds = data.users.map(u => u.id);
      if (userIds.length > 0) {
        await client.query('DELETE FROM shirin_users WHERE NOT (id = ANY($1))', [userIds]);
      }

      // 2. Sync Configs with UPSERT
      for (const c of data.configs) {
        await client.query(`
          INSERT INTO shirin_configs (id, name, protocol, server, port, uuid, password, username, transport, path, host, sni, security, alpn, flow, reality_public_key, reality_short_id, spider_x, remark, operator_preset, clean_ip, use_clean_ip, fragment, fragment_length, fragment_interval, fragment_packets, active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            protocol = EXCLUDED.protocol,
            server = EXCLUDED.server,
            port = EXCLUDED.port,
            uuid = EXCLUDED.uuid,
            password = EXCLUDED.password,
            username = EXCLUDED.username,
            transport = EXCLUDED.transport,
            path = EXCLUDED.path,
            host = EXCLUDED.host,
            sni = EXCLUDED.sni,
            security = EXCLUDED.security,
            alpn = EXCLUDED.alpn,
            flow = EXCLUDED.flow,
            reality_public_key = EXCLUDED.reality_public_key,
            reality_short_id = EXCLUDED.reality_short_id,
            spider_x = EXCLUDED.spider_x,
            remark = EXCLUDED.remark,
            operator_preset = EXCLUDED.operator_preset,
            clean_ip = EXCLUDED.clean_ip,
            use_clean_ip = EXCLUDED.use_clean_ip,
            fragment = EXCLUDED.fragment,
            fragment_length = EXCLUDED.fragment_length,
            fragment_interval = EXCLUDED.fragment_interval,
            fragment_packets = EXCLUDED.fragment_packets,
            active = EXCLUDED.active
        `, [
          c.id, c.name, c.protocol, c.server, c.port, c.uuid || null, c.password || null, c.username || null,
          c.transport, c.path || null, c.host || null, c.sni || null, c.security, c.alpn || null, c.flow || null,
          c.realityPublicKey || null, c.realityShortId || null, c.spiderX || null, c.remark || '', c.operatorPreset || null,
          c.cleanIp || null, Boolean(c.useCleanIp), Boolean(c.fragment), c.fragmentLength || null, c.fragmentInterval || null,
          c.fragmentPackets || null, c.active, c.createdAt
        ]);
      }
      const configIds = data.configs.map(c => c.id);
      if (configIds.length > 0) {
        await client.query('DELETE FROM shirin_configs WHERE NOT (id = ANY($1))', [configIds]);
      }

      // 3. Sync Clean IPs
      for (const ip of data.cleanIps) {
        await client.query(`
          INSERT INTO shirin_clean_ips (id, ip, operator, name, isp_name_fa, ping_ms, active, added_at, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            ip = EXCLUDED.ip,
            operator = EXCLUDED.operator,
            name = EXCLUDED.name,
            isp_name_fa = EXCLUDED.isp_name_fa,
            ping_ms = EXCLUDED.ping_ms,
            active = EXCLUDED.active,
            notes = EXCLUDED.notes
        `, [
          ip.id, ip.ip, ip.operator, ip.name, ip.ispNameFa,
          ip.pingMs !== undefined ? ip.pingMs : null, ip.active, ip.addedAt, ip.notes || null
        ]);
      }

      // 4. Save metadata
      await client.query(`
        INSERT INTO shirin_meta (key, value) VALUES
          ('adminPasswordHash', $1::jsonb),
          ('adminUsername', $2::jsonb),
          ('lifetimeUploadBytes', $3::jsonb),
          ('lifetimeDownloadBytes', $4::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [
        JSON.stringify(data.adminPasswordHash),
        JSON.stringify(data.adminUsername),
        JSON.stringify(data.lifetimeUploadBytes),
        JSON.stringify(data.lifetimeDownloadBytes)
      ]);

      // 5. Sync active sessions
      await client.query('DELETE FROM shirin_sessions WHERE expires_at <= $1', [Date.now()]);
      for (const [token, sess] of Object.entries(data.sessions)) {
        if (sess.expiresAt > Date.now()) {
          await client.query(`
            INSERT INTO shirin_sessions (token, username, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at
          `, [token, sess.username, sess.expiresAt]);
        }
      }

      await client.query('COMMIT');
      return true;
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to save PostgreSQL database:', err?.message || err);
      return false;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.ready = false;
  }
}
