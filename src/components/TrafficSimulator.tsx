import React, { useState } from 'react';
import { 
  Sparkles, 
  HardDrive, 
  ArrowUpRight, 
  ArrowDownRight, 
  Play, 
  RotateCcw, 
  ShieldAlert, 
  CheckCircle, 
  Clock, 
  Terminal,
  Activity,
  Server,
  Zap
} from 'lucide-react';
import { UserAccount, ProxyConfig } from '../types';
import { formatBytes } from '../utils/configParsers';

interface TrafficSimulatorProps {
  users: UserAccount[];
  configs: ProxyConfig[];
  onLogTraffic: (userId: string, uploadMB: number, downloadMB: number, configId: string) => void;
  onResetUserTraffic: (userId: string) => void;
  lang: 'fa' | 'en';
}

export const TrafficSimulator: React.FC<TrafficSimulatorProps> = ({
  users,
  configs,
  onLogTraffic,
  onResetUserTraffic,
  lang,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [selectedConfigId, setSelectedConfigId] = useState<string>(configs[0]?.id || '');
  const [uploadAmountMB, setUploadAmountMB] = useState<number>(50);
  const [downloadAmountMB, setDownloadAmountMB] = useState<number>(350);
  const [isSimulating, setIsSimulating] = useState(false);
  const [logs, setLogs] = useState<Array<{ id: string; text: string; time: string }>>([
    { id: '1', text: 'Traffic Monitor initialized. Ready to record bandwidth.', time: new Date().toLocaleTimeString() }
  ]);

  const selectedUser = users.find(u => u.id === selectedUserId) || users[0];

  const handleSimulate = (upMB: number, downMB: number) => {
    if (!selectedUser) return;
    setIsSimulating(true);

    onLogTraffic(selectedUser.id, upMB, downMB, selectedConfigId);

    const newLog = {
      id: String(Date.now()),
      text: `[TRAFFIC] +${upMB}MB Upload / +${downMB}MB Download recorded for @${selectedUser.username} on node [${selectedConfigId}]`,
      time: new Date().toLocaleTimeString(),
    };
    setLogs(prev => [newLog, ...prev.slice(0, 19)]);

    setTimeout(() => {
      setIsSimulating(false);
    }, 400);
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
          <span>{lang === 'fa' ? 'مدیریت و شبیه‌ساز مصرف ترافیک' : 'Bandwidth Management & Live Simulator'}</span>
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {lang === 'fa' 
            ? 'تست دقیق مصرف حجم کاربران، اعمال محدودیت‌های گیگابایتی و مشاهده هدرهای مهسا آن‌جی' 
            : 'Simulate client downloads and verify Subscription-Userinfo quota calculation'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Interactive Control Box */}
        <div className="lg:col-span-2 rounded-xl border border-[#222222] bg-[#131313] p-6 space-y-5 shadow-xl shadow-black">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#222222] pb-4">
            <div>
              <h3 className="font-serif text-lg text-white font-medium">
                {lang === 'fa' ? 'تست ارسال و دریافت دیتا' : 'Traffic Injection Test'}
              </h3>
              <p className="text-xs text-gray-500">
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
                  className="text-[#c5a47e] hover:text-[#b3936d] font-medium"
                >
                  {lang === 'fa' ? 'صفر کردن مصرف' : 'Reset to 0'}
                </button>
              </div>
            </div>
          )}

          {/* Quick Simulation Buttons */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-gray-400 font-medium">
              {lang === 'fa' ? 'تزریق ترافیک سریع:' : 'Quick Traffic Injection:'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => handleSimulate(10, 100)}
                disabled={isSimulating}
                className="rounded-lg border border-[#262626] bg-[#0e0e0e] p-2.5 text-xs font-medium text-gray-200 hover:border-[#c5a47e]/50 hover:bg-[#1a1a1a] transition-all flex flex-col items-center gap-1"
              >
                <Zap className="h-4 w-4 text-amber-400" />
                <span>+100 MB {lang === 'fa' ? 'وب‌گردی' : 'Browse'}</span>
              </button>

              <button
                onClick={() => handleSimulate(50, 500)}
                disabled={isSimulating}
                className="rounded-lg border border-[#262626] bg-[#0e0e0e] p-2.5 text-xs font-medium text-gray-200 hover:border-[#c5a47e]/50 hover:bg-[#1a1a1a] transition-all flex flex-col items-center gap-1"
              >
                <Zap className="h-4 w-4 text-blue-400" />
                <span>+500 MB {lang === 'fa' ? 'ویدیو اینستا' : 'Instagram'}</span>
              </button>

              <button
                onClick={() => handleSimulate(100, 1024)}
                disabled={isSimulating}
                className="rounded-lg border border-[#262626] bg-[#0e0e0e] p-2.5 text-xs font-medium text-gray-200 hover:border-[#c5a47e]/50 hover:bg-[#1a1a1a] transition-all flex flex-col items-center gap-1"
              >
                <Zap className="h-4 w-4 text-purple-400" />
                <span>+1.0 GB {lang === 'fa' ? 'دانلود فیلم' : 'Stream HD'}</span>
              </button>

              <button
                onClick={() => handleSimulate(500, 5120)}
                disabled={isSimulating}
                className="rounded-lg border border-[#262626] bg-[#0e0e0e] p-2.5 text-xs font-medium text-rose-300 hover:border-rose-500/50 hover:bg-[#1a1a1a] transition-all flex flex-col items-center gap-1"
              >
                <Zap className="h-4 w-4 text-rose-400" />
                <span>+5.0 GB {lang === 'fa' ? 'تست مصرف بالا' : 'Heavy Quota'}</span>
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
                  Profile-Update-Interval: 12<br />
                  Profile-Title: RayPanel: {selectedUser.username}
                </code>
              </div>
            )}
          </div>

        </div>

        {/* Right: Live Traffic Event Log */}
        <div className="rounded-xl border border-[#222222] bg-[#131313] p-6 space-y-4 shadow-xl shadow-black">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-white text-base flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[#c5a47e]" />
              <span>{lang === 'fa' ? 'لاگ زنده مصرف' : 'Live Traffic Log'}</span>
            </h3>
            <span className="flex h-2 w-2 rounded-full bg-[#c5a47e] animate-pulse" />
          </div>

          <div className="h-80 overflow-y-auto space-y-2 rounded-lg bg-[#0a0a0a] p-3 font-mono text-[11px] text-gray-300 border border-[#1f1f1f]">
            {logs.map((log) => (
              <div key={log.id} className="border-b border-[#181818] pb-1.5 last:border-0">
                <span className="text-gray-600">[{log.time}]</span>{' '}
                <span className="text-[#c5a47e]">{log.text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
