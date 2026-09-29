import React, { useState, useEffect, useRef } from 'react';
import { 
  HardDrive, 
  Terminal,
  Activity,
  Server,
  Zap,
  Trash2,
  Radio,
  ArrowDown,
  ArrowUp
} from 'lucide-react';
import { UserAccount, ProxyConfig, SystemStats } from '../types';
import { formatBytes } from '../utils/configParsers';

interface TrafficSimulatorProps {
  users: UserAccount[];
  configs: ProxyConfig[];
  authToken: string | null;
  stats?: SystemStats | null;
  onLogTraffic: (userId: string, uploadMB: number, downloadMB: number, configId: string) => void;
  onResetUserTraffic: (userId: string) => void;
  lang: 'fa' | 'en';
}

interface LogEntry {
  id: string;
  text: string;
  time: string;
  type?: 'live' | 'test' | 'info';
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return `${parseFloat((bps / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const TrafficSimulator: React.FC<TrafficSimulatorProps> = ({
  users,
  configs,
  authToken,
  stats,
  onLogTraffic,
  onResetUserTraffic,
  lang,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [selectedConfigId, setSelectedConfigId] = useState<string>(configs[0]?.id || '');
  const [isSimulating, setIsSimulating] = useState(false);
  
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      text: lang === 'fa' 
        ? 'مانیتور ترافیک فعال شد. در حال گوش دادن به تبادل داده...' 
        : 'Traffic Monitor initialized. Listening to live bandwidth...',
      time: new Date().toLocaleTimeString(),
      type: 'info'
    }
  ]);

  const lastUploadBytesRef = useRef<number | null>(null);
  const lastDownloadBytesRef = useRef<number | null>(null);

  // Poll /api/stats every 2 seconds for live traffic bandwidth
  useEffect(() => {
    if (!authToken) return;

    let isMounted = true;

    const pollStats = async () => {
      try {
        const res = await fetch('/api/stats', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        if (!res.ok || !isMounted) return;

        const data = await res.json();
        const currentStats: SystemStats = data.stats;
        if (!currentStats) return;

        const upSpeed = currentStats.liveUploadSpeedBps || 0;
        const downSpeed = currentStats.liveDownloadSpeedBps || 0;
        const currentTotalUp = currentStats.totalUploadBytes ?? 0;
        const currentTotalDown = currentStats.totalDownloadBytes ?? 0;

        let deltaBytes = 0;
        if (lastUploadBytesRef.current !== null && lastDownloadBytesRef.current !== null) {
          const deltaUp = Math.max(0, currentTotalUp - lastUploadBytesRef.current);
          const deltaDown = Math.max(0, currentTotalDown - lastDownloadBytesRef.current);
          deltaBytes = deltaUp + deltaDown;
        }

        lastUploadBytesRef.current = currentTotalUp;
        lastDownloadBytesRef.current = currentTotalDown;

        // If active traffic throughput is detected (> 0 bps or delta bytes occurred)
        if (upSpeed > 0 || downSpeed > 0 || deltaBytes > 0) {
          const timeStr = new Date().toLocaleTimeString();
          const downFormatted = formatSpeed(downSpeed);
          const upFormatted = formatSpeed(upSpeed);
          const deltaFormatted = deltaBytes > 0 ? formatBytes(deltaBytes) : formatBytes(upSpeed + downSpeed);

          const logLine: LogEntry = {
            id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text: `↓ ${downFormatted}  ↑ ${upFormatted}  |  total +${deltaFormatted}`,
            time: timeStr,
            type: 'live'
          };

          setLogs(prev => [logLine, ...prev.slice(0, 49)]);
        }
      } catch (e) {
        // quiet error
      }
    };

    const interval = setInterval(pollStats, 2000);
    // Initial fetch
    pollStats();

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [authToken]);

  const selectedUser = users.find(u => u.id === selectedUserId) || users[0];

  const handleSimulate = (upMB: number, downMB: number, label: string) => {
    if (!selectedUser) return;
    setIsSimulating(true);

    onLogTraffic(selectedUser.id, upMB, downMB, selectedConfigId);

    const newLog: LogEntry = {
      id: `test-${Date.now()}`,
      text: lang === 'fa'
        ? `[تست شبیه‌سازی] +${upMB}MB آپلود / +${downMB}MB دانلود برای @${selectedUser.username} روی نود [${selectedConfigId || 'پیش‌فرض'}]`
        : `[TEST SIMULATOR] +${upMB}MB Upload / +${downMB}MB Download recorded for @${selectedUser.username} on node [${selectedConfigId || 'default'}]`,
      time: new Date().toLocaleTimeString(),
      type: 'test'
    };
    setLogs(prev => [newLog, ...prev.slice(0, 49)]);

    setTimeout(() => {
      setIsSimulating(false);
    }, 400);
  };

  const handleClearLogs = () => {
    setLogs([
      {
        id: `init-${Date.now()}`,
        text: lang === 'fa' 
          ? 'لاگ مانیتور پاکسازی شد. آماده دریافت بسته‌های جدید...' 
          : 'Log cleared. Ready to record bandwidth...',
        time: new Date().toLocaleTimeString(),
        type: 'info'
      }
    ]);
  };

  const totalUsedBytes = selectedUser ? (selectedUser.usedUploadBytes + selectedUser.usedDownloadBytes) : 0;
  const maxBytes = selectedUser ? (selectedUser.quotaGB * 1024 * 1024 * 1024) : 1;
  const percentUsed = Math.min(100, Math.round((totalUsedBytes / maxBytes) * 100));

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-serif font-light text-white flex items-center gap-2.5">
          <Activity className="h-5 w-5 text-[#c5a47e]" />
          <span>{lang === 'fa' ? 'مانیتورینگ و شبیه‌ساز مصرف ترافیک' : 'Bandwidth Management & Live Simulator'}</span>
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {lang === 'fa' 
            ? 'مانیتور آنلاین مصرف ترافیک سرور به صورت زنده، تست تزریق حجم و مشاهده هدرهای مهسا آن‌جی' 
            : 'Live proxy traffic bandwidth monitor, test injection, and MahsaNG quota verification'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Interactive Control Box */}
        <div className="lg:col-span-2 rounded-xl border border-[#222222] bg-[#131313] p-6 space-y-5 shadow-xl shadow-black">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#222222] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-lg text-white font-medium">
                  {lang === 'fa' ? 'تست ارسال و دریافت دیتا' : 'Traffic Injection Test'}
                </h3>
                <span className="text-[10px] bg-[#c5a47e]/10 text-[#c5a47e] border border-[#c5a47e]/30 px-2 py-0.5 rounded-full font-medium">
                  {lang === 'fa' ? 'ابزار شبیه‌سازی تستی' : 'Simulation Tool'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {lang === 'fa' ? 'یک کاربر را انتخاب کرده و ترافیک تستی به آن اضافه کنید' : 'Select user and add test traffic'}
              </p>
            </div>

            {selectedUser && (
              <div className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] px-3 py-1.5 border border-[#262626]">
                <span className="text-xs text-gray-400">{lang === 'fa' ? 'کاربر:' : 'User:'}</span>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="bg-transparent text-xs font-medium text-[#c5a47e] outline-none cursor-pointer"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id} className="bg-[#141414] text-white">
                      {u.username} ({u.quotaGB} GB)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* User Status Card */}
          {selectedUser && (
            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-[#c5a47e]" />
                  <span className="font-medium text-white text-xs">{selectedUser.username}</span>
                </div>
                <span className="font-mono text-xs text-[#c5a47e] font-medium">
                  {formatBytes(totalUsedBytes)} / {selectedUser.quotaGB} GB ({percentUsed}%)
                </span>
              </div>

              <div className="h-1.5 w-full bg-[#1c1c1c] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    percentUsed > 90 ? 'bg-rose-500' : 'bg-[#c5a47e]'
                  }`}
                  style={{ width: `${percentUsed}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-400">
                <span>{lang === 'fa' ? 'آپلود:' : 'Upload:'} {formatBytes(selectedUser.usedUploadBytes)}</span>
                <span>{lang === 'fa' ? 'دانلود:' : 'Download:'} {formatBytes(selectedUser.usedDownloadBytes)}</span>
                <button
                  onClick={() => onResetUserTraffic(selectedUser.id)}
                  className="text-[#c5a47e] hover:text-[#b3936d] font-medium transition-colors"
                >
                  {lang === 'fa' ? 'صفر کردن مصرف' : 'Reset to 0'}
                </button>
              </div>
            </div>
          )}

          {/* Quick Simulation Buttons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-gray-400 font-medium">
                {lang === 'fa' ? 'شبیه‌ساز تزریق ترافیک تستی:' : 'Traffic Injection Simulator:'}
              </label>
              <span className="text-[10px] text-gray-500">
                {lang === 'fa' ? '(اعمال روی دیتابیس واقعی کاربر)' : '(Persists to real user record)'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => handleSimulate(10, 100, 'Browse')}
                disabled={isSimulating}
                className="rounded-lg border border-[#262626] bg-[#0e0e0e] p-2.5 text-xs font-medium text-gray-200 hover:border-[#c5a47e]/50 hover:bg-[#1a1a1a] transition-all flex flex-col items-center gap-1 active:scale-95"
              >
                <Zap className="h-4 w-4 text-amber-400" />
                <span>+100 MB {lang === 'fa' ? '(وب‌گردی)' : '(Browse)'}</span>
                <span className="text-[9px] text-gray-500">{lang === 'fa' ? 'شبیه‌سازی' : 'Simulate'}</span>
              </button>

              <button
                onClick={() => handleSimulate(50, 500, 'Instagram')}
                disabled={isSimulating}
                className="rounded-lg border border-[#262626] bg-[#0e0e0e] p-2.5 text-xs font-medium text-gray-200 hover:border-[#c5a47e]/50 hover:bg-[#1a1a1a] transition-all flex flex-col items-center gap-1 active:scale-95"
              >
                <Zap className="h-4 w-4 text-blue-400" />
                <span>+500 MB {lang === 'fa' ? '(اینستاگرام)' : '(Instagram)'}</span>
                <span className="text-[9px] text-gray-500">{lang === 'fa' ? 'شبیه‌سازی' : 'Simulate'}</span>
              </button>

              <button
                onClick={() => handleSimulate(100, 1024, 'Stream')}
                disabled={isSimulating}
                className="rounded-lg border border-[#262626] bg-[#0e0e0e] p-2.5 text-xs font-medium text-gray-200 hover:border-[#c5a47e]/50 hover:bg-[#1a1a1a] transition-all flex flex-col items-center gap-1 active:scale-95"
              >
                <Zap className="h-4 w-4 text-purple-400" />
                <span>+1.0 GB {lang === 'fa' ? '(ویدیو HD)' : '(Stream HD)'}</span>
                <span className="text-[9px] text-gray-500">{lang === 'fa' ? 'شبیه‌سازی' : 'Simulate'}</span>
              </button>

              <button
                onClick={() => handleSimulate(500, 5120, 'Heavy')}
                disabled={isSimulating}
                className="rounded-lg border border-[#262626] bg-[#0e0e0e] p-2.5 text-xs font-medium text-rose-300 hover:border-rose-500/50 hover:bg-[#1a1a1a] transition-all flex flex-col items-center gap-1 active:scale-95"
              >
                <Zap className="h-4 w-4 text-rose-400" />
                <span>+5.0 GB {lang === 'fa' ? '(مصرف سنگین)' : '(Heavy Quota)'}</span>
                <span className="text-[9px] text-gray-500">{lang === 'fa' ? 'شبیه‌سازی' : 'Simulate'}</span>
              </button>
            </div>
          </div>

          {/* MahsaNG Response Headers Simulator */}
          <div className="rounded-lg border border-[#c5a47e]/20 bg-[#0a0a0a] p-4 space-y-2 font-mono text-xs">
            <div className="flex items-center gap-2 text-[#c5a47e] font-medium text-[11px]">
              <Server className="h-3.5 w-3.5" />
              <span>{lang === 'fa' ? 'هدرهای بازگشتی به مهسا آن‌جی (Subscription-Userinfo):' : 'MahsaNG Protocol Header Preview:'}</span>
            </div>
            {selectedUser && (
              <div className="bg-[#111111] rounded-lg p-3 text-gray-300 text-[11px] overflow-x-auto select-all border border-[#1f1f1f]">
                <code>
                  HTTP/1.1 200 OK<br />
                  Content-Type: text/plain; charset=utf-8<br />
                  Subscription-Userinfo: upload={selectedUser.usedUploadBytes}; download={selectedUser.usedDownloadBytes}; total={maxBytes}; expire={Math.floor(new Date(selectedUser.expireAt).getTime() / 1000)}<br />
                  Profile-Update-Interval: 6<br />
                  Profile-Title: Shirin-RayPanel: {selectedUser.username}
                </code>
              </div>
            )}
          </div>

        </div>

        {/* Right: Live Traffic Event Log */}
        <div className="rounded-xl border border-[#222222] bg-[#131313] p-6 space-y-4 shadow-xl shadow-black flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[#c5a47e]" />
              <h3 className="font-serif text-white text-base">
                {lang === 'fa' ? 'لاگ زنده مصرف' : 'Live Traffic Log'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearLogs}
                title={lang === 'fa' ? 'پاکسازی لاگ' : 'Clear log'}
                className="text-gray-500 hover:text-rose-400 p-1 rounded transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-1.5 bg-[#0e0e0e] px-2 py-0.5 rounded-full border border-[#262626]">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-gray-400">2s</span>
              </div>
            </div>
          </div>

          {/* Quick live speed badge banner */}
          {stats && (
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-[#0a0a0a] p-2.5 rounded-lg border border-[#1f1f1f]">
              <div className="flex items-center gap-1.5 text-blue-400">
                <ArrowDown className="h-3.5 w-3.5" />
                <span>↓ {formatSpeed(stats.liveDownloadSpeedBps)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <ArrowUp className="h-3.5 w-3.5" />
                <span>↑ {formatSpeed(stats.liveUploadSpeedBps)}</span>
              </div>
            </div>
          )}

          {/* Terminal log window (capped at 50 entries) */}
          <div className="h-80 overflow-y-auto space-y-2 rounded-lg bg-[#0a0a0a] p-3 font-mono text-[11px] text-gray-300 border border-[#1f1f1f] flex-1">
            {logs.map((log) => (
              <div key={log.id} className="border-b border-[#181818] pb-1.5 last:border-0 flex items-start gap-1.5">
                <span className="text-gray-600 shrink-0">[{log.time}]</span>{' '}
                <span className={
                  log.type === 'live' 
                    ? 'text-emerald-400 font-medium' 
                    : log.type === 'test' 
                    ? 'text-[#c5a47e]' 
                    : 'text-gray-400'
                }>
                  {log.text}
                </span>
              </div>
            ))}
          </div>

          <div className="text-[10px] text-gray-500 flex items-center justify-between">
            <span>{lang === 'fa' ? `تعداد خطوط: ${logs.length} / ۵۰` : `Entries: ${logs.length} / 50`}</span>
            <span className="flex items-center gap-1 text-gray-400">
              <Radio className="h-3 w-3 text-emerald-500 animate-pulse" />
              {lang === 'fa' ? 'دریافت خودکار از سرور' : 'Auto polling stats'}
            </span>
          </div>
        </div>

      </div>

    </div>
  );
};
