export type ProxyProtocol = 'vless' | 'trojan' | 'vmess' | 'http' | 'shadowsocks';
export type TransportType = 'ws' | 'grpc' | 'tcp' | 'httpupgrade';
export type SecurityType = 'tls' | 'reality' | 'none';

export interface ProxyConfig {
  id: string;
  name: string;
  protocol: ProxyProtocol;
  server: string;
  port: number;
  uuid?: string; // For VLESS / VMess
  password?: string; // For Trojan / HTTP / Shadowsocks
  username?: string; // For HTTP Auth
  transport: TransportType;
  path?: string; // e.g., /vless-ws or /trojan-ws
  host?: string; // HTTP Host header or SNI
  sni?: string; // Server Name Indication for TLS
  security: SecurityType;
  alpn?: string; // e.g. h2,http/1.1
  flow?: string; // e.g. xtls-rprx-vision
  realityPublicKey?: string;
  realityShortId?: string;
  spiderX?: string;
  remark: string;
  operatorPreset?: 'all' | 'mci' | 'irancell' | 'rightel' | 'mokhaberat' | 'custom';
  cleanIp?: string;
  active: boolean;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  username: string;
  email?: string;
  token: string; // Secret sub token
  quotaGB: number;
  usedUploadBytes: number;
  usedDownloadBytes: number;
  expireAt: string; // ISO date string
  active: boolean;
  allowedConfigs: string[]; // ['all'] or array of config IDs
  notes?: string;
  createdAt: string;
  lastConnectedAt?: string;
}

export interface TrafficRecord {
  id: string;
  timestamp: string;
  userId: string;
  configId: string;
  uploadBytes: number;
  downloadBytes: number;
}

export interface DatabaseSettings {
  type: 'local_json' | 'postgres' | 'supabase' | 'firebase' | 'mongodb';
  connectionString?: string;
  status: 'connected' | 'disconnected' | 'syncing';
  autoBackup: boolean;
  lastSynced?: string;
}

export interface SystemStats {
  totalConfigs: number;
  activeConfigs: number;
  totalUsers: number;
  activeUsers: number;
  totalTrafficGB: number;
  usedTrafficGB: number;
  todayTrafficMB: number;
  railwayStatus: 'ready' | 'configured' | 'pending';
}
