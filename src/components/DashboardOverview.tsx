import React from 'react';
import { 
  Layers, 
  Users, 
  HardDrive, 
  Radio, 
  QrCode, 
  Sparkles, 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldCheck, 
  Wifi, 
  CheckCircle,
  Copy,
  Check,
  Zap,
  Clock
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { ProxyConfig, UserAccount, SystemStats } from '../types';
import { formatBytes } from '../utils/configParsers';

interface DashboardOverviewProps {
  stats: SystemStats | null;
  configs: ProxyConfig[];
  users: UserAccount[];
  onOpenSubModal: (user: UserAccount) => void;
  onNavigateTab: (tab: string) => void;
  lang: 'fa' | 'en';
  appUrl: string;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  stats,
  configs,
  users,
  onOpenSubModal,
  onNavigateTab,
  lang,
  appUrl,
}) => {
  const [copied, setCopied] = React.useState(false);
  const primaryUser = users[0] || { token: 'sub_default' };
  const origin = typeof window !== 'undefined' ? window.location.origin : (appUrl || 'https://raypanel.app');
  const primarySubUrl = `${origin}/sub/${primaryUser.token}`;

  const copyMainSub = () => {
    navigator.clipboard.writeText(primarySubUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Mock hourly data points for traffic visualization
  const mockChartData = [
    { time: '00:00', uploadMB: 120, downloadMB: 480 },
    { time: '04:00', uploadMB: 80, downloadMB: 290 },
    { time: '08:00', uploadMB: 240, downloadMB: 1100 },
    { time: '12:00', uploadMB: 380, downloadMB: 1850 },
    { time: '16:00', uploadMB: 420, downloadMB: 2100 },
    { time: '20:00', uploadMB: 510, downloadMB: 2600 },
    { time: 'Now', uploadMB: 630, downloadMB: 3200 },
  ];

  const totalUsedBytes = users.reduce((acc, u) => acc + (u.usedUploadBytes + u.usedDownloadBytes), 0);
  const totalQuotaBytes = users.reduce((acc, u) => acc + (u.quotaGB * 1024 * 1024 * 1024), 0) || (50 * 1024 * 1024 * 1024);
  const percentUsed = Math.min(100, Math.round((totalUsedBytes / totalQuotaBytes) * 100));

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-[#222222] bg-gradient-to-tr from-[#161616] via-[#111111] to-[#0d0d0d] p-7 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#c5a47e]/10 px-3 py-1 text-[11px] font-medium text-[#c5a47e] border border-[#c5a47e]/20 tracking-wider">
              <span className="flex h-2 w-2 rounded-full bg-[#c5a47e] animate-ping" />
              <span>{lang === 'fa' ? 'سیستم آماده اتصال و پخش ساب‌اسکریپشن' : 'System Active & Broadcasting'}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif font-light text-white tracking-tight">
              {lang === 'fa' ? 'پیشخوان مدیریتی اختصاصی' : 'Private VLESS & Trojan Node Hub'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 font-light leading-relaxed">
              {lang === 'fa' 
                ? 'مدیریت هوشمند پروتکل‌های VLESS و Trojan، پیکربندی اختصاصی ریلوی و لینک‌های ساب‌اسکریپشن مهسا آن‌جی' 
                : 'Smart management of VLESS & Trojan protocols, custom Railway configurations, and MahsaNG subscription links.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              id="btn-hero-qr-sub"
              onClick={() => onOpenSubModal(primaryUser)}
              className="flex items-center gap-2 rounded-lg bg-[#c5a47e] px-5 py-3 text-xs font-semibold text-black shadow-lg shadow-[#c5a47e]/20 hover:bg-[#b3936d] transition-all active:scale-95"
            >
              <QrCode className="h-4 w-4" />
              <span>{lang === 'fa' ? 'کد QR مهسا آن‌جی' : 'MahsaNG QR'}</span>
            </button>
            <button
              onClick={() => onNavigateTab('configs')}
              className="flex items-center gap-2 rounded-lg border border-[#333333] bg-[#1a1a1a] px-5 py-3 text-xs font-medium text-gray-200 hover:bg-[#222222] hover:border-[#c5a47e]/40 transition-all"
            >
              <Layers className="h-4 w-4 text-[#c5a47e]" />
              <span>{lang === 'fa' ? 'مدیریت کانفیگ‌ها' : 'Manage Nodes'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Configs */}
        <div className="rounded-xl border border-[#222222] bg-[#151515] p-5 relative overflow-hidden group hover:border-[#c5a47e]/40 transition-all">
          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-widest text-gray-400">
              {lang === 'fa' ? 'کانفیگ‌های فعال' : 'Active Nodes'}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] border border-[#c5a47e]/20">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="relative z-10 mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-serif text-[#c5a47e]">{configs.filter(c => c.active).length}</span>
            <span className="text-xs text-gray-400 font-mono">/ {configs.length} {lang === 'fa' ? 'کل' : 'Total'}</span>
          </div>
          <div className="relative z-10 mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span>VLESS, Trojan, HTTP</span>
          </div>
          <div className="absolute -bottom-3 -left-3 text-white/[0.03] text-5xl font-serif select-none pointer-events-none">CFG</div>
        </div>

        {/* Total Users */}
        <div className="rounded-xl border border-[#222222] bg-[#151515] p-5 relative overflow-hidden group hover:border-[#c5a47e]/40 transition-all">
          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-widest text-gray-400">
              {lang === 'fa' ? 'کاربران فعال' : 'Active Users'}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] border border-[#c5a47e]/20">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="relative z-10 mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-serif text-[#c5a47e]">{users.filter(u => u.active).length}</span>
            <span className="text-xs text-gray-400 font-mono">/ {users.length} {lang === 'fa' ? 'اکانت' : 'Accounts'}</span>
          </div>
          <div className="relative z-10 mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c5a47e]" />
            <span>{lang === 'fa' ? 'ساب‌های فعال و آنلاین' : 'Active Subscriptions'}</span>
          </div>
          <div className="absolute -bottom-3 -left-3 text-white/[0.03] text-5xl font-serif select-none pointer-events-none">USR</div>
        </div>

        {/* Traffic Consumed */}
        <div className="rounded-xl border border-[#222222] bg-[#151515] p-5 relative overflow-hidden group hover:border-[#c5a47e]/40 transition-all">
          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-widest text-gray-400">
              {lang === 'fa' ? 'ترافیک مصرفی' : 'Bandwidth Used'}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] border border-[#c5a47e]/20">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <div className="relative z-10 mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-serif text-[#c5a47e]">{formatBytes(totalUsedBytes)}</span>
            <span className="text-xs text-gray-400 font-mono">({percentUsed}%)</span>
          </div>
          <div className="relative z-10 mt-2 h-1 w-full bg-[#222222] rounded-full overflow-hidden">
            <div className="h-full bg-[#c5a47e] rounded-full" style={{ width: `${percentUsed}%` }} />
          </div>
          <div className="absolute -bottom-3 -left-3 text-white/[0.03] text-5xl font-serif select-none pointer-events-none">TRF</div>
        </div>

        {/* Railway Status */}
        <div className="rounded-xl border border-[#222222] bg-[#151515] p-5 relative overflow-hidden group hover:border-[#c5a47e]/40 transition-all">
          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-widest text-gray-400">
              {lang === 'fa' ? 'وضعیت ریلوی (Railway)' : 'Railway Status'}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10 text-green-400 border border-green-500/20">
              <Radio className="h-4 w-4" />
            </div>
          </div>
          <div className="relative z-10 mt-3 flex items-center gap-2">
            <span className="text-xl font-serif text-green-400">
              {lang === 'fa' ? 'متصل و فعال' : 'Sync Active'}
            </span>
          </div>
          <div className="relative z-10 mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span>Dockerfile & Xray Engine</span>
          </div>
          <div className="absolute -bottom-3 -left-3 text-white/[0.03] text-5xl font-serif select-none pointer-events-none">RLW</div>
        </div>

      </div>

      {/* Traffic Usage Chart & Operator Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart Column */}
        <div className="lg:col-span-2 rounded-2xl border border-[#222222] bg-[#111111] p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1a1a1a]">
            <div>
              <h3 className="font-serif text-lg text-white font-normal">
                {lang === 'fa' ? 'مانیتورینگ لحظه‌ای مصرف ترافیک' : 'Real-time Traffic Consumption'}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {lang === 'fa' ? 'محاسبه پهنای باند آپلود و دانلود بر اساس مگابایت' : 'Upload & Download throughput in MB'}
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-[#c5a47e]">
                <span className="h-2 w-2 rounded-full bg-[#c5a47e]" />
                <span className="font-light">{lang === 'fa' ? 'دانلود' : 'Download'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400">
                <span className="h-2 w-2 rounded-full bg-gray-500" />
                <span className="font-light">{lang === 'fa' ? 'آپلود' : 'Upload'}</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c5a47e" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#c5a47e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#888888" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#888888" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#444444" fontSize={11} />
                <YAxis stroke="#444444" fontSize={11} tickFormatter={(val) => `${val}M`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#161616', borderColor: '#2e2e2e', borderRadius: '8px', fontSize: '12px', color: '#e0e0e0' }} 
                  formatter={(value: any) => [`${value} MB`]}
                />
                <Area type="monotone" dataKey="downloadMB" stroke="#c5a47e" strokeWidth={2} fillOpacity={1} fill="url(#colorDownload)" />
                <Area type="monotone" dataKey="uploadMB" stroke="#888888" strokeWidth={1.5} fillOpacity={1} fill="url(#colorUpload)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Operator Presets Card */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#222222] bg-[#111111] p-6 space-y-4">
            <h3 className="font-serif text-lg text-white font-normal flex items-center gap-2">
              <Wifi className="h-4 w-4 text-[#c5a47e]" />
              <span>{lang === 'fa' ? 'آی‌پی‌های تمیز اپراتورها' : 'Clean IP Status for Iran'}</span>
            </h3>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-lg border border-[#1e1e1e] bg-[#161616] p-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#c5a47e]" />
                  <span className="font-medium text-gray-200">همراه اول (MCI)</span>
                </div>
                <span className="font-mono text-[#c5a47e]">104.16.132.229</span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-[#1e1e1e] bg-[#161616] p-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#c5a47e]" />
                  <span className="font-medium text-gray-200">ایرانسل (Irancell)</span>
                </div>
                <span className="font-mono text-[#c5a47e]">162.159.136.232</span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-[#1e1e1e] bg-[#161616] p-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#c5a47e]" />
                  <span className="font-medium text-gray-200">رایتل (Rightel)</span>
                </div>
                <span className="font-mono text-[#c5a47e]">104.19.141.15</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => onNavigateTab('railway')}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] py-2.5 text-xs font-medium text-gray-300 hover:bg-[#222222] hover:text-[#c5a47e] hover:border-[#c5a47e]/30 transition-all"
              >
                <Radio className="h-3.5 w-3.5 text-[#c5a47e]" />
                <span>{lang === 'fa' ? 'راهنمای دیپلوی در Railway' : 'View Railway Deployment'}</span>
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
