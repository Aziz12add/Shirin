import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { createHmac } from 'crypto';
import {
  ProxyConfig,
  UserAccount,
  CleanIpEntry,
  TrafficRecord,
  DatabaseSettings
} from '../types';

// ==========================================
// Types
// ==========================================
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

export interface SeedOptions {
  adminUsername: string;
  adminPasswordHash: string;
  /** Must be stable across restarts (SESSION_SECRET env). All seed credentials derive from it. */
  secret: string;
  /** Public hostname, e.g. "myapp.wasmer.app" (PUBLIC_HOST env). */
  publicHost: string;
  seedUsername?: string;
}

// ==========================================
// Deterministic credentials
// ==========================================
function derive(secret: string, label: string): Buffer {
  return createHmac('sha256', secret).update(label).digest();
}

/** UUID v5-style, derived from secret + label: same input always gives the same UUID. */
export function stableUuid(secret: string, label: string): string {
  const h = derive(secret, 'uuid:' + label);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export function stableTrojanPassword(secret: string, label: string): string {
  return 'Pass_' + derive(secret, 'trojan:' + label).toString('hex').slice(0, 12);
}

export function stableSubToken(secret: string, label: string): string {
  return 'sub_' + derive(secret, 'token:' + label).toString('hex').slice(0, 16);
}

// ==========================================
// Seed data
// ==========================================
const ts = '2026-01-01T00:00:00.000Z';

export const defaultInitialCleanIps: CleanIpEntry[] = [
  { id: 'cip-mci-1', ip: '104.16.132.229', operator: 'mci', name: 'MCI Cloudflare Anycast 1', ispNameFa: 'همراه اول (تهران / شیراز)', pingMs: 42, active: true, addedAt: ts, notes: 'پینگ عالی و پایدار روی همراه اول' },
  { id: 'cip-mci-2', ip: '162.159.192.1', operator: 'mci', name: 'MCI Cloudflare Subnet 162', ispNameFa: 'همراه اول (کل کشور)', pingMs: 48, active: true, addedAt: ts, notes: 'تست شده بدون پکت لاس' },
  { id: 'cip-irancell-1', ip: '162.159.136.232', operator: 'irancell', name: 'MTN Irancell Fast IP 1', ispNameFa: 'ایرانسل (LTE / 5G)', pingMs: 38, active: true, addedAt: ts, notes: 'سرعت دانلود بالا روی دکل‌های ایرانسل' },
  { id: 'cip-irancell-2', ip: '104.17.209.9', operator: 'irancell', name: 'MTN Irancell CDN IP 2', ispNameFa: 'ایرانسل (مشهد / تبریز)', pingMs: 45, active: true, addedAt: ts, notes: 'بسیار پایدار برای وب‌سوکت' },
  { id: 'cip-rightel-1', ip: '104.21.48.1', operator: 'rightel', name: 'Rightel Optimized IP', ispNameFa: 'رایتل (3G / 4G)', pingMs: 55, active: true, addedAt: ts, notes: 'مناسب اینترنت رایتل' },
  { id: 'cip-fixed-1', ip: '104.19.154.241', operator: 'fixed', name: 'Fixed Line (Shatel / Mokhaberat)', ispNameFa: 'شاتل / مخابرات / آسیاتک', pingMs: 34, active: true, addedAt: ts, notes: 'تست شده روی ADSL و فیبر نوری تانوما' }
];

/**
 * Fresh-database seed. Every credential is derived from SESSION_SECRET,
 * so wiping the database and re-seeding yields the SAME UUID / password / sub token.
 */
export function createSeedData(o: SeedOptions): PersistentStorageSchema {
  const name = o.seedUsername || 'default-user';
  const seedUuid = stableUuid(o.secret, name);
  const seedTrojanPass = stableTrojanPassword(o.secret, name);
  const seedSubToken = stableSubToken(o.secret, name);
  const host = o.publicHost;
  const now = new Date().toISOString();

  const configs: ProxyConfig[] = [
    {
      id: 'cfg-vless-ws-1',
      name: 'VLESS-WS (MCI)',
      protocol: 'vless',
      server: host,
      port: 443,
      uuid: seedUuid,
      transport: 'ws',
      path: '/vless-ws',
      host,
      sni: host,
      security: 'tls',
      remark: '⚡ VLESS WS-TLS 🇮🇷 MCI',
      operatorPreset: 'mci',
      cleanIp: '104.16.132.229',
      useCleanIp: false,
      fragment: true,
      fragmentLength: '10-50',
      fragmentInterval: '20-50',
      fragmentPackets: 'tlshello',
      active: true,
      createdAt: now,
    },
    {
      id: 'cfg-trojan-ws-2',
      name: 'Trojan-WS (Irancell)',
      protocol: 'trojan',
      server: host,
      port: 443,
      password: seedTrojanPass,
      transport: 'ws',
      path: '/trojan-ws',
      host,
      sni: host,
      security: 'tls',
      remark: '🚀 Trojan WS-TLS 🇮🇷 Irancell',
      operatorPreset: 'irancell',
      cleanIp: '162.159.136.232',
      useCleanIp: false,
      active: true,
      createdAt: now,
    }
  ];

  const users: UserAccount[] = [
    {
      id: 'usr-admin-1',
      username: name,
      token: seedSubToken,
      uuid: seedUuid,
      trojanPassword: seedTrojanPass,
      quotaGB: 60,
      usedUploadBytes: 0,
      usedDownloadBytes: 0,
      expireAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      active: true,
      allowedConfigs: ['all'],
      createdAt: now,
    }
  ];

  return {
    configs,
    users,
    cleanIps: defaultInitialCleanIps,
    traffic: [],
    settings: {
      type: 'local_json',
      autoBackup: true,
      lastBackupAt: now,
      status: 'connected',
      lastSynced: now,
      adminUsername: o.adminUsername
    },
    adminPasswordHash: o.adminPasswordHash,
    adminUsername: o.adminUsername,
    lifetimeUploadBytes: 0,
    lifetimeDownloadBytes: 0,
    sessions: {}
  };
}

// ==========================================
// 1. JSON FILE ADAPTER (local dev only — NOT durable on Wasmer)
// ==========================================
export class JsonFilePersistenceAdapter implements PersistenceAdapter {
  private dbFile: string;
  private backupFile: string;
  private ready = false;
  private isSaving = false;

  constructor(private dataDir: string, private seed: SeedOptions) {
    this.dbFile = path.join(dataDir, 'database.json');
    this.backupFile = path.join(dataDir, 'database.bak.json');
  }

  async init(): Promise<void> {
    try {
      await fs.promises.mkdir(this.dataDir, { recursive: true });
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

  private async readJson(file: string): Promise<any | null> {
    try {
      return JSON.parse(await fs.promises.readFile(file, 'utf-8'));
    } catch {
      return null;
    }
  }

  async load(): Promise<PersistentStorageSchema> {
    for (const file of [this.dbFile, this.backupFile]) {
      const parsed = await this.readJson(file);
      if (parsed && Array.isArray(parsed.configs) && Array.isArray(parsed.users)) {
        return this.normalize(parsed);
      }
    }
    console.log('🌱 Fresh JSON database: seeding with deterministic credentials');
    const seed = createSeedData(this.seed);
    await this.save(seed, true);
    return seed;
  }

  private normalize(raw: any): PersistentStorageSchema {
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
        adminUsername: this.seed.adminUsername
      },
      adminPasswordHash: raw.adminPasswordHash || this.seed.adminPasswordHash,
      adminUsername: raw.adminUsername || this.seed.adminUsername,
      lifetimeUploadBytes: typeof raw.lifetimeUploadBytes === 'number' ? raw.lifetimeUploadBytes : 0,
      lifetimeDownloadBytes: typeof raw.lifetimeDownloadBytes === 'number' ? raw.lifetimeDownloadBytes : 0,
      sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {}
    };
  }

  async save(data: PersistentStorageSchema, force = false): Promise<boolean> {
    if (this.isSaving && !force) return false;
    this.isSaving = true;
    try {
      if (data.traffic.length > 100) data.traffic = data.traffic.slice(-100);
      data.settings.lastSynced = new Date().toISOString();

      const json = JSON.stringify(data);
      const tmp = `${this.dbFile}.tmp`;
      const tmpBak = `${this.backupFile}.tmp`;

      await fs.promises.writeFile(tmp, json, 'utf-8');
      await fs.promises.rename(tmp, this.dbFile);
      // atomic backup too
      await fs.promises.writeFile(tmpBak, json, 'utf-8');
      await fs.promises.rename(tmpBak, this.backupFile);
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
// 2. POSTGRES ADAPTER (use this on Wasmer)
// ==========================================
type Diff<T> = { changed: T[]; removed: string[]; next: Map<string, string> };

export class PostgresPersistenceAdapter implements PersistenceAdapter {
  private pool: pg.Pool | null = null;
  private ready = false;
  /** key -> JSON of what is currently in the DB; lets save() write only what changed */
  private snap = new Map<string, string>();

  /** A connection string (Neon, Supabase, ...) or explicit pool settings (Wasmer managed database). */
  constructor(private connection: string | pg.PoolConfig, private seed: SeedOptions) {}

  async init(): Promise<void> {
    const base: pg.PoolConfig = typeof this.connection === 'string'
      ? {
          connectionString: this.connection,
          ssl: /localhost|127\.0\.0\.1/.test(this.connection)
            ? false
            : { rejectUnauthorized: process.env.PG_SSL_INSECURE !== '1' },
        }
      : this.connection;
    this.pool = new pg.Pool({ ...base, connectionTimeoutMillis: 5000, max: 5 });

    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      await this.migrate(client);
      this.ready = true;
      console.log('✅ PostgreSQL connected and migrations verified.');
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

  private async migrate(client: pg.PoolClient): Promise<void> {
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

  // ---------- change tracking ----------
  private diff<T>(prefix: string, items: T[], idOf: (t: T) => string): Diff<T> {
    const changed: T[] = [];
    const next = new Map<string, string>();
    for (const it of items) {
      const k = prefix + idOf(it);
      const s = JSON.stringify(it);
      next.set(k, s);
      if (this.snap.get(k) !== s) changed.push(it);
    }
    const removed: string[] = [];
    for (const k of this.snap.keys()) {
      if (k.startsWith(prefix) && !next.has(k)) removed.push(k.slice(prefix.length));
    }
    return { changed, removed, next };
  }

  private commitSnap(prefix: string, d: Diff<unknown>) {
    for (const id of d.removed) this.snap.delete(prefix + id);
    for (const [k, v] of d.next) this.snap.set(k, v);
  }

  private primeSnapshot(d: PersistentStorageSchema) {
    this.snap.clear();
    this.commitSnap('u:', this.diff('u:', d.users, u => u.id));
    this.commitSnap('c:', this.diff('c:', d.configs, c => c.id));
    this.commitSnap('i:', this.diff('i:', d.cleanIps, i => i.id));
    this.commitSnap('t:', this.diff('t:', d.traffic, t => t.id));
    this.commitSnap('s:', this.diff('s:', this.sessionList(d), s => s.token));
    this.snap.set('meta', this.metaJson(d));
  }

  private sessionList(d: PersistentStorageSchema) {
    return Object.entries(d.sessions).map(([token, s]) => ({ token, ...s }));
  }

  private metaJson(d: PersistentStorageSchema): string {
    return JSON.stringify([d.adminPasswordHash, d.adminUsername, d.lifetimeUploadBytes, d.lifetimeDownloadBytes]);
  }

  // ---------- load ----------
  async load(): Promise<PersistentStorageSchema> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();

    try {
      const [usersRes, configsRes, cleanIpsRes, trafficRes, metaRes, sessionsRes] = await Promise.all([
        client.query('SELECT * FROM shirin_users ORDER BY created_at ASC'),
        client.query('SELECT * FROM shirin_configs ORDER BY created_at DESC'),
        client.query('SELECT * FROM shirin_clean_ips ORDER BY added_at ASC'),
        client.query('SELECT * FROM shirin_traffic ORDER BY timestamp DESC LIMIT 100'),
        client.query('SELECT key, value FROM shirin_meta'),
        client.query('SELECT token, username, expires_at FROM shirin_sessions WHERE expires_at > $1', [Date.now()]),
      ]);

      if (usersRes.rows.length === 0 && configsRes.rows.length === 0) {
        console.log('🌱 Fresh PostgreSQL database: seeding with deterministic credentials');
        const seed = createSeedData(this.seed);
        seed.settings.type = 'postgres';
        await this.save(seed, true);
        return seed;
      }

      const meta: { [k: string]: any } = {};
      metaRes.rows.forEach(r => { meta[r.key] = r.value; });

      const sessions: PersistentStorageSchema['sessions'] = {};
      sessionsRes.rows.forEach(r => {
        sessions[r.token] = { username: r.username, expiresAt: Number(r.expires_at) };
      });

      const iso = (v: any, fallback?: string) => (v ? new Date(v).toISOString() : fallback);

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
        expireAt: iso(r.expire_at, new Date(Date.now() + 30 * 86400000).toISOString())!,
        active: Boolean(r.active),
        allowedConfigs: Array.isArray(r.allowed_configs) ? r.allowed_configs : ['all'],
        notes: r.notes || undefined,
        createdAt: iso(r.created_at, new Date().toISOString())!,
        lastConnectedAt: iso(r.last_connected_at),
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
        createdAt: iso(r.created_at, new Date().toISOString())!,
      }));

      const cleanIps: CleanIpEntry[] = cleanIpsRes.rows.length > 0
        ? cleanIpsRes.rows.map(r => ({
            id: r.id,
            ip: r.ip,
            operator: r.operator,
            name: r.name,
            ispNameFa: r.isp_name_fa,
            pingMs: r.ping_ms !== null ? Number(r.ping_ms) : undefined,
            active: Boolean(r.active),
            addedAt: iso(r.added_at, new Date().toISOString())!,
            notes: r.notes || undefined,
          }))
        : defaultInitialCleanIps;

      const traffic: TrafficRecord[] = trafficRes.rows.map(r => ({
        id: r.id,
        timestamp: new Date(r.timestamp).toISOString(),
        userId: r.user_id,
        configId: r.config_id,
        uploadBytes: Number(r.upload_bytes),
        downloadBytes: Number(r.download_bytes)
      }));

      const result: PersistentStorageSchema = {
        configs,
        users,
        cleanIps,
        traffic,
        // NOTE: connection string is deliberately NOT exposed in settings
        settings: {
          type: 'postgres',
          autoBackup: true,
          status: 'connected',
          lastSynced: new Date().toISOString(),
          adminUsername: meta.adminUsername || this.seed.adminUsername
        },
        adminPasswordHash: meta.adminPasswordHash || this.seed.adminPasswordHash,
        adminUsername: meta.adminUsername || this.seed.adminUsername,
        lifetimeUploadBytes: Number(meta.lifetimeUploadBytes || 0),
        lifetimeDownloadBytes: Number(meta.lifetimeDownloadBytes || 0),
        sessions
      };

      this.primeSnapshot(result);
      return result;
    } finally {
      client.release();
    }
  }

  // ---------- save (only changed rows) ----------
  async save(data: PersistentStorageSchema, _force?: boolean): Promise<boolean> {
    if (!this.pool) return false;

    const users = this.diff('u:', data.users, u => u.id);
    const configs = this.diff('c:', data.configs, c => c.id);
    const ips = this.diff('i:', data.cleanIps, i => i.id);
    const traffic = this.diff('t:', data.traffic, t => t.id);
    const sess = this.diff('s:', this.sessionList(data), s => s.token);
    const metaNow = this.metaJson(data);
    const metaChanged = this.snap.get('meta') !== metaNow;

    const nothing =
      !users.changed.length && !users.removed.length &&
      !configs.changed.length && !configs.removed.length &&
      !ips.changed.length && !ips.removed.length &&
      !traffic.changed.length &&
      !sess.changed.length && !sess.removed.length &&
      !metaChanged;
    if (nothing) return true;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const u of users.changed) {
        await client.query(`
          INSERT INTO shirin_users (id, username, email, token, uuid, trojan_password, quota_gb, used_upload_bytes, used_download_bytes, expire_at, active, allowed_configs, notes, created_at, last_connected_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username, email = EXCLUDED.email, token = EXCLUDED.token,
            uuid = EXCLUDED.uuid, trojan_password = EXCLUDED.trojan_password,
            quota_gb = EXCLUDED.quota_gb, used_upload_bytes = EXCLUDED.used_upload_bytes,
            used_download_bytes = EXCLUDED.used_download_bytes, expire_at = EXCLUDED.expire_at,
            active = EXCLUDED.active, allowed_configs = EXCLUDED.allowed_configs,
            notes = EXCLUDED.notes, last_connected_at = EXCLUDED.last_connected_at
        `, [
          u.id, u.username, u.email || null, u.token, u.uuid || null, u.trojanPassword || null,
          u.quotaGB, u.usedUploadBytes, u.usedDownloadBytes, u.expireAt, u.active,
          JSON.stringify(u.allowedConfigs), u.notes || null, u.createdAt, u.lastConnectedAt || null
        ]);
      }
      if (users.removed.length) {
        await client.query('DELETE FROM shirin_users WHERE id = ANY($1)', [users.removed]);
      }

      for (const c of configs.changed) {
        await client.query(`
          INSERT INTO shirin_configs (id, name, protocol, server, port, uuid, password, username, transport, path, host, sni, security, alpn, flow, reality_public_key, reality_short_id, spider_x, remark, operator_preset, clean_ip, use_clean_ip, fragment, fragment_length, fragment_interval, fragment_packets, active, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, protocol = EXCLUDED.protocol, server = EXCLUDED.server, port = EXCLUDED.port,
            uuid = EXCLUDED.uuid, password = EXCLUDED.password, username = EXCLUDED.username,
            transport = EXCLUDED.transport, path = EXCLUDED.path, host = EXCLUDED.host, sni = EXCLUDED.sni,
            security = EXCLUDED.security, alpn = EXCLUDED.alpn, flow = EXCLUDED.flow,
            reality_public_key = EXCLUDED.reality_public_key, reality_short_id = EXCLUDED.reality_short_id,
            spider_x = EXCLUDED.spider_x, remark = EXCLUDED.remark, operator_preset = EXCLUDED.operator_preset,
            clean_ip = EXCLUDED.clean_ip, use_clean_ip = EXCLUDED.use_clean_ip, fragment = EXCLUDED.fragment,
            fragment_length = EXCLUDED.fragment_length, fragment_interval = EXCLUDED.fragment_interval,
            fragment_packets = EXCLUDED.fragment_packets, active = EXCLUDED.active
        `, [
          c.id, c.name, c.protocol, c.server, c.port, c.uuid || null, c.password || null, c.username || null,
          c.transport, c.path || null, c.host || null, c.sni || null, c.security, c.alpn || null, c.flow || null,
          c.realityPublicKey || null, c.realityShortId || null, c.spiderX || null, c.remark || '', c.operatorPreset || null,
          c.cleanIp || null, Boolean(c.useCleanIp), Boolean(c.fragment), c.fragmentLength || null, c.fragmentInterval || null,
          c.fragmentPackets || null, c.active, c.createdAt
        ]);
      }
      if (configs.removed.length) {
        await client.query('DELETE FROM shirin_configs WHERE id = ANY($1)', [configs.removed]);
      }

      for (const ip of ips.changed) {
        await client.query(`
          INSERT INTO shirin_clean_ips (id, ip, operator, name, isp_name_fa, ping_ms, active, added_at, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (id) DO UPDATE SET
            ip = EXCLUDED.ip, operator = EXCLUDED.operator, name = EXCLUDED.name,
            isp_name_fa = EXCLUDED.isp_name_fa, ping_ms = EXCLUDED.ping_ms,
            active = EXCLUDED.active, notes = EXCLUDED.notes
        `, [ip.id, ip.ip, ip.operator, ip.name, ip.ispNameFa, ip.pingMs ?? null, ip.active, ip.addedAt, ip.notes || null]);
      }
      if (ips.removed.length) {
        await client.query('DELETE FROM shirin_clean_ips WHERE id = ANY($1)', [ips.removed]);
      }

      // Traffic log: insert new records only, prune old ones
      for (const t of traffic.changed) {
        await client.query(`
          INSERT INTO shirin_traffic (id, timestamp, user_id, config_id, upload_bytes, download_bytes)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING
        `, [t.id, t.timestamp, t.userId, t.configId, t.uploadBytes, t.downloadBytes]);
      }
      if (traffic.changed.length) {
        await client.query(`DELETE FROM shirin_traffic WHERE timestamp < NOW() - INTERVAL '30 days'`);
      }

      if (metaChanged) {
        await client.query(`
          INSERT INTO shirin_meta (key, value) VALUES
            ('adminPasswordHash', $1::jsonb), ('adminUsername', $2::jsonb),
            ('lifetimeUploadBytes', $3::jsonb), ('lifetimeDownloadBytes', $4::jsonb)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `, [
          JSON.stringify(data.adminPasswordHash), JSON.stringify(data.adminUsername),
          JSON.stringify(data.lifetimeUploadBytes), JSON.stringify(data.lifetimeDownloadBytes)
        ]);
      }

      await client.query('DELETE FROM shirin_sessions WHERE expires_at <= $1', [Date.now()]);
      if (sess.removed.length) {
        await client.query('DELETE FROM shirin_sessions WHERE token = ANY($1)', [sess.removed]);
      }
      for (const s of sess.changed) {
        if (s.expiresAt <= Date.now()) continue;
        await client.query(`
          INSERT INTO shirin_sessions (token, username, expires_at) VALUES ($1,$2,$3)
          ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at
        `, [s.token, s.username, s.expiresAt]);
      }

      await client.query('COMMIT');

      // update snapshot only after a successful commit
      this.commitSnap('u:', users);
      this.commitSnap('c:', configs);
      this.commitSnap('i:', ips);
      for (const [k, v] of traffic.next) this.snap.set(k, v);
      this.commitSnap('s:', sess);
      this.snap.set('meta', metaNow);
      return true;
    } catch (err: any) {
      try { await client.query('ROLLBACK'); } catch {}
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

// ==========================================
// 3. WHERE IS POSTGRES?
// ==========================================
/**
 * Lookup order:
 *  1. DATABASE_URL / POSTGRES_URL (Neon, Supabase, ...)
 *  2. DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD, which Wasmer Edge injects for its managed
 *     database (it never injects DATABASE_URL).
 * Returns null when neither is available, or when the Wasmer database is MySQL (this app needs PostgreSQL).
 */
export function resolvePostgresConnection(env: NodeJS.ProcessEnv = process.env): string | pg.PoolConfig | null {
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) return url;

  const { DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD } = env;
  if (!DB_HOST || !DB_NAME || !DB_USERNAME || !DB_PASSWORD) return null;

  if (/^(db|mysql)\./.test(DB_HOST)) {
    console.error(
      '❌ The attached Wasmer database is MySQL (host starts with "db." or "mysql."), but this app needs PostgreSQL. ' +
      'Export anything you need, delete the database, and create a PostgreSQL one in the Databases tab.'
    );
    return null;
  }

  return {
    host: DB_HOST,
    port: Number(DB_PORT) || 5432, // managed instances do not use the standard port; DB_PORT is always set
    database: DB_NAME,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    // TLS stays on; chain verification is off because Wasmer's server certificate comes from a private CA.
    ssl: { rejectUnauthorized: false },
  };
}
