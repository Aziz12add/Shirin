import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Copy, 
  Check, 
  QrCode, 
  Trash2, 
  RotateCcw, 
  Power, 
  HardDrive, 
  Key, 
  ShieldCheck, 
  Sparkles,
  RefreshCw,
  Fingerprint,
  Lock,
  CheckCircle2
} from 'lucide-react';
import { UserAccount, ProxyConfig } from '../types';
import { formatBytes } from '../utils/configParsers';

interface UserManagerProps {
  users: UserAccount[];
  configs: ProxyConfig[];
  onSaveUser: (user: UserAccount) => void;
  onDeleteUser: (id: string) => void;
  onResetTraffic: (id: string) => void;
  onToggleUser: (id: string) => void;
  onResetUserUuid?: (user: UserAccount) => void;
  onOpenSubModal: (user: UserAccount) => void;
  lang: 'fa' | 'en';
  appUrl: string;
}

export const UserManager: React.FC<UserManagerProps> = ({
  users,
  configs,
  onSaveUser,
  onDeleteUser,
  onResetTraffic,
  onToggleUser,
  onResetUserUuid,
  onOpenSubModal,
  lang,
  appUrl,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedUuid, setCopiedUuid] = useState<string | null>(null);

  // Form State
  const [formUser, setFormUser] = useState<Partial<UserAccount>>({
    username: '',
    email: '',
    token: '',
    uuid: '',
    trojanPassword: '',
    quotaGB: 30,
    expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    active: true,
    allowedConfigs: ['all'],
    notes: '',
  });

  const origin = typeof window !== 'undefined' ? window.location.origin : (appUrl || 'https://raypanel.app');

  const generateRandomUuid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const handleGenerateToken = () => {
    const token = `sub_${Math.random().toString(36).substring(2, 8)}_${Date.now().toString(36)}`;
    setFormUser(prev => ({ ...prev, token }));
  };

  const handleGenerateUuid = () => {
    const uuid = generateRandomUuid();
    setFormUser(prev => ({ ...prev, uuid }));
  };

  const handleGenerateTrojanPassword = () => {
    const pass = `Pass_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36).slice(-4)}`;
    setFormUser(prev => ({ ...prev, trojanPassword: pass }));
  };

  const handleCopySubUrl = (user: UserAccount) => {
    const url = `${origin}/sub/${user.token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(user.id);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCopyUuid = (uuid: string, userId: string) => {
    navigator.clipboard.writeText(uuid);
    setCopiedUuid(userId);
    setTimeout(() => setCopiedUuid(null), 2000);
  };

  const handleResetUserWithNewUuid = (user: UserAccount) => {
    const newUuid = generateRandomUuid();
    const newTrojanPass = `Pass_${Math.random().toString(36).substring(2, 8)}`;
    const confirmMsg = lang === 'fa'
      ? `آیا از تغییر UUID کاربر «${user.username}» مطمئن هستید؟ با این کار کانکشن‌های قدیمی قطع شده و کلاینت باید ساب‌اسکریپشن را آپدیت کند.`
      : `Regenerate UUID for user "${user.username}"? Old connections will drop until they update their subscription.`;

    if (!confirm(confirmMsg)) return;

    if (onResetUserUuid) {
      onResetUserUuid({
        ...user,
        uuid: newUuid,
        trojanPassword: newTrojanPass,
      });
    } else {
      onSaveUser({
        ...user,
        uuid: newUuid,
        trojanPassword: newTrojanPass,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const generatedUuid = formUser.uuid || generateRandomUuid();
    const generatedTrojanPass = formUser.trojanPassword || `Pass_${Math.random().toString(36).substring(2, 8)}`;

    const userToSave: UserAccount = {
      id: formUser.id || `usr-${Date.now()}`,
      username: formUser.username || `user_${Date.now().toString().slice(-4)}`,
      email: formUser.email || '',
      token: formUser.token || `sub_${Math.random().toString(36).substring(2, 8)}`,
      uuid: generatedUuid,
      trojanPassword: generatedTrojanPass,
      quotaGB: Number(formUser.quotaGB) || 30,
      usedUploadBytes: formUser.usedUploadBytes || 0,
      usedDownloadBytes: formUser.usedDownloadBytes || 0,
      expireAt: formUser.expireAt ? new Date(formUser.expireAt).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      active: formUser.active ?? true,
      allowedConfigs: formUser.allowedConfigs || ['all'],
      notes: formUser.notes || '',
      createdAt: formUser.createdAt || new Date().toISOString(),
    };

    onSaveUser(userToSave);
    setShowAddModal(false);
    setFormUser({
      username: '',
      email: '',
      token: '',
      uuid: '',
      trojanPassword: '',
      quotaGB: 30,
      expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      active: true,
      allowedConfigs: ['all'],
      notes: '',
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-light text-white flex items-center gap-2.5">
            <Users className="h-5 w-5 text-[#c5a47e]" />
            <span>{lang === 'fa' ? 'کاربران و شناسه‌های احراز هویت (UUID)' : 'User Accounts & Authentication UUIDs'}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {lang === 'fa' 
              ? 'احراز هویت VLESS مستقیماً با UUID هر کاربر در این بخش بررسی می‌شود. برای اتصال، کلاینت باید UUID همینجا را داشته باشد.' 
              : 'VLESS proxy authenticates against each user UUID. Subscriptions distribute these dedicated credentials.'}
          </p>
        </div>

        <button
          id="btn-open-add-user"
          onClick={() => {
            handleGenerateToken();
            handleGenerateUuid();
            handleGenerateTrojanPassword();
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-[#c5a47e] px-4 py-2.5 text-xs font-semibold text-black shadow-lg shadow-[#c5a47e]/20 hover:bg-[#b3936d] transition-all"
        >
          <UserPlus className="h-4 w-4 stroke-[3]" />
          <span>{lang === 'fa' ? '+ تعریف کاربر جدید' : '+ Add New User'}</span>
        </button>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {users.map((user) => {
          const totalUsedBytes = user.usedUploadBytes + user.usedDownloadBytes;
          const maxBytes = user.quotaGB * 1024 * 1024 * 1024;
          const usagePercent = Math.min(100, Math.round((totalUsedBytes / maxBytes) * 100)) || 0;
          const isExpired = new Date(user.expireAt).getTime() < Date.now();
          const daysLeft = Math.max(0, Math.ceil((new Date(user.expireAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
          const subUrl = `${origin}/sub/${user.token}`;
          const isCopied = copiedToken === user.id;
          const isUuidCopied = copiedUuid === user.id;

          return (
            <div
              key={user.id}
              className={`rounded-xl border transition-all ${
                user.active && !isExpired
                  ? 'border-[#222222] bg-[#131313] shadow-lg shadow-black'
                  : 'border-rose-950/30 bg-[#0e0e0e] opacity-75'
              }`}
            >
              <div className="p-5 space-y-4">
                
                {/* User Top Info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1c1c1c] text-[#c5a47e] font-serif font-bold border border-[#2a2a2a]">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white text-sm">{user.username}</h3>
                        {user.active ? (
                          <span className="rounded bg-[#c5a47e]/10 px-2 py-0.5 text-[10px] font-medium text-[#c5a47e] border border-[#c5a47e]/20">
                            {lang === 'fa' ? 'فعال' : 'Active'}
                          </span>
                        ) : (
                          <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400 border border-rose-500/20">
                            {lang === 'fa' ? 'غیرفعال' : 'Disabled'}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-gray-500">{user.email || user.token}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onToggleUser(user.id)}
                      className={`rounded-lg p-2 transition-colors ${
                        user.active
                          ? 'bg-[#c5a47e]/15 text-[#c5a47e] hover:bg-[#c5a47e]/25'
                          : 'bg-[#1a1a1a] text-gray-600 hover:bg-[#222222]'
                      }`}
                      title={user.active ? 'Suspend User' : 'Activate User'}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDeleteUser(user.id)}
                      className="rounded-lg p-2 text-gray-600 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
                      title="Delete User"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Dedicated UUID Badge & One-Click Copy */}
                <div className="rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-2.5 space-y-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between text-[10px] text-gray-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1 text-[#c5a47e]">
                      <Fingerprint className="h-3 w-3" />
                      <span>{lang === 'fa' ? 'شناسه احراز هویت VLESS (UUID):' : 'VLESS Auth UUID:'}</span>
                    </span>
                    <button
                      onClick={() => handleCopyUuid(user.uuid || '', user.id)}
                      className="hover:text-white flex items-center gap-1 text-[10px]"
                    >
                      {isUuidCopied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">{lang === 'fa' ? 'کپی شد' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>{lang === 'fa' ? 'کپی UUID' : 'Copy UUID'}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-gray-200 select-all truncate text-[11px] bg-[#141414] p-1.5 rounded border border-[#222222]">
                    {user.uuid || '— بدون UUID —'}
                  </div>
                </div>

                {/* Quota Progress Bar */}
                <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 flex items-center gap-1.5">
                      <HardDrive className="h-3.5 w-3.5 text-[#c5a47e]" />
                      {lang === 'fa' ? 'مصرف ترافیک' : 'Bandwidth Usage'}
                    </span>
                    <span className="font-mono text-white font-medium">
                      {formatBytes(totalUsedBytes)} <span className="text-gray-600 font-normal">/ {user.quotaGB} GB</span>
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-[#1c1c1c] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        usagePercent > 90 ? 'bg-rose-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-[#c5a47e]'
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-500 pt-0.5">
                    <span>
                      {lang === 'fa' ? 'آپلود:' : 'Up:'} {formatBytes(user.usedUploadBytes)} | {lang === 'fa' ? 'دانلود:' : 'Down:'} {formatBytes(user.usedDownloadBytes)}
                    </span>
                    <span className="font-mono text-[#c5a47e]">{usagePercent}%</span>
                  </div>
                </div>

                {/* Validity & Nodes info */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-[#1f1f1f] bg-[#0e0e0e] p-2.5">
                    <span className="text-gray-600 text-[10px] uppercase tracking-wider block mb-0.5">{lang === 'fa' ? 'تاریخ انقضا' : 'EXPIRE DATE'}</span>
                    <span className={`font-medium ${isExpired ? 'text-rose-400' : 'text-gray-200'}`}>
                      {isExpired ? (lang === 'fa' ? 'منقضی شده' : 'Expired') : `${daysLeft} ${lang === 'fa' ? 'روز مانده' : 'days left'}`}
                    </span>
                  </div>

                  <div className="rounded-lg border border-[#1f1f1f] bg-[#0e0e0e] p-2.5">
                    <span className="text-gray-600 text-[10px] uppercase tracking-wider block mb-0.5">{lang === 'fa' ? 'دسترسی نودها' : 'ALLOWED NODES'}</span>
                    <span className="font-medium text-[#c5a47e]">
                      {user.allowedConfigs.includes('all') ? (lang === 'fa' ? 'تمام کانفیگ‌ها' : 'All Nodes') : `${user.allowedConfigs.length} ${lang === 'fa' ? 'کانفیگ' : 'Nodes'}`}
                    </span>
                  </div>
                </div>

                {/* Subscription Action Box */}
                <div className="rounded-lg border border-[#c5a47e]/20 bg-[#0a0a0a] p-2.5 flex items-center justify-between gap-2">
                  <div className="truncate font-mono text-[11px] text-[#c5a47e]">
                    {subUrl}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleCopySubUrl(user)}
                      className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#161616] px-2.5 py-1 text-xs font-medium text-gray-300 hover:border-[#c5a47e]/40 hover:text-[#c5a47e] transition-colors"
                    >
                      {isCopied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                      <span>{isCopied ? (lang === 'fa' ? 'کپی شد' : 'Copied') : (lang === 'fa' ? 'کپی ساب' : 'Copy')}</span>
                    </button>
                    <button
                      onClick={() => onOpenSubModal(user)}
                      className="flex items-center gap-1 rounded-lg bg-[#c5a47e] px-2.5 py-1 text-xs font-semibold text-black hover:bg-[#b3936d] transition-colors shadow-sm"
                    >
                      <QrCode className="h-3 w-3" />
                      <span>{lang === 'fa' ? 'QR مهسا آن‌جی' : 'QR & App'}</span>
                    </button>
                  </div>
                </div>

                {/* Footer Utilities */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1e1e1e] pt-2 text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onResetTraffic(user.id)}
                      className="flex items-center gap-1 text-gray-500 hover:text-[#c5a47e] transition-colors text-[11px]"
                      title="Reset bandwidth"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>{lang === 'fa' ? 'صفر کردن ترافیک' : 'Reset Traffic'}</span>
                    </button>

                    <button
                      onClick={() => handleResetUserWithNewUuid(user)}
                      className="flex items-center gap-1 text-rose-400 hover:text-rose-300 transition-colors text-[11px]"
                      title={lang === 'fa' ? 'تولید UUID نو و قطع اتصالات قدیمی' : 'Regenerate UUID and invalidate old one'}
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>{lang === 'fa' ? 'بازنشانی با UUID جدید' : 'New UUID'}</span>
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setFormUser({
                        ...user,
                        uuid: user.uuid || generateRandomUuid(),
                        trojanPassword: user.trojanPassword || `Pass_${Math.random().toString(36).substring(2, 8)}`,
                        expireAt: new Date(user.expireAt).toISOString().split('T')[0]
                      });
                      setShowAddModal(true);
                    }}
                    className="text-gray-400 hover:text-white text-[11px]"
                  >
                    {lang === 'fa' ? 'ویرایش مشخصات' : 'Edit Details'}
                  </button>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#131313] shadow-2xl shadow-black">
            
            <div className="flex items-center justify-between border-b border-[#222222] bg-[#0d0d0d] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c5a47e]/10 text-[#c5a47e] border border-[#c5a47e]/20">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg text-white font-medium">
                    {formUser.id ? (lang === 'fa' ? 'ویرایش کاربر' : 'Edit User') : (lang === 'fa' ? 'تعریف کاربر جدید' : 'Create User')}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {lang === 'fa' ? 'تنظیم UUID اختصاصی VLESS، پسورد تروجان و توکن اشتراک' : 'Set dedicated VLESS UUID, Trojan password and quota'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-[#222222] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1.5">
                  {lang === 'fa' ? 'نام کاربری (Username)' : 'Username'}
                </label>
                <input
                  type="text"
                  required
                  value={formUser.username}
                  onChange={(e) => setFormUser(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="مثال: family_member"
                  className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white outline-none focus:border-[#c5a47e]"
                />
              </div>

              {/* VLESS UUID Input & Generator */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#c5a47e] flex items-center gap-1.5">
                    <Fingerprint className="h-3.5 w-3.5" />
                    <span>{lang === 'fa' ? 'شناسه احراز هویت اختصاصی VLESS (UUID):' : 'Dedicated VLESS UUID:'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateUuid}
                    className="text-[11px] text-[#c5a47e] hover:text-[#b3936d] flex items-center gap-1 font-medium"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>{lang === 'fa' ? 'تولید UUID تصادفی' : 'Generate UUID'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={formUser.uuid || ''}
                  onChange={(e) => setFormUser(prev => ({ ...prev, uuid: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
                  className="w-full rounded-lg border border-[#333333] bg-[#0a0a0a] px-3 py-2 text-xs text-emerald-400 font-mono outline-none focus:border-[#c5a47e]"
                />
                <span className="text-[10px] text-gray-500 block mt-1">
                  {lang === 'fa' 
                    ? '⚠️ سرور VLESS فقط اتصالاتی که با این UUID درخواست بدهند را تایید می‌کند.' 
                    : 'The server verifies incoming VLESS handshakes against this exact UUID.'}
                </span>
              </div>

              {/* Trojan Password Input & Generator */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-purple-400" />
                    <span>{lang === 'fa' ? 'رمز عبور اختصاصی تروجان (Trojan Password):' : 'Trojan Password:'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateTrojanPassword}
                    className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium"
                  >
                    <Key className="h-3 w-3" />
                    <span>{lang === 'fa' ? 'تولید رمز' : 'Generate Pass'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={formUser.trojanPassword || ''}
                  onChange={(e) => setFormUser(prev => ({ ...prev, trojanPassword: e.target.value }))}
                  className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-purple-300 font-mono outline-none focus:border-purple-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'محدودیت حجم (گیگابایت)' : 'Quota (GB)'}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formUser.quotaGB}
                    onChange={(e) => setFormUser(prev => ({ ...prev, quotaGB: parseInt(e.target.value) }))}
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'تاریخ انقضا' : 'Expire Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={formUser.expireAt}
                    onChange={(e) => setFormUser(prev => ({ ...prev, expireAt: e.target.value }))}
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-300">
                    {lang === 'fa' ? 'توکن ساب‌اسکریپشن (Sub Token)' : 'Subscription Token'}
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateToken}
                    className="text-[11px] text-[#c5a47e] hover:text-[#b3936d] flex items-center gap-1 font-medium"
                  >
                    <Key className="h-3 w-3" />
                    <span>{lang === 'fa' ? 'تولید توکن رندوم' : 'Random Token'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={formUser.token}
                  onChange={(e) => setFormUser(prev => ({ ...prev, token: e.target.value }))}
                  className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1.5">
                  {lang === 'fa' ? 'یادداشت یا توضیحات (اختیاری)' : 'Notes (Optional)'}
                </label>
                <input
                  type="text"
                  value={formUser.notes || ''}
                  onChange={(e) => setFormUser(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="مثال: گوشی اندروید شخصی"
                  className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white outline-none focus:border-[#c5a47e]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#222222] pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-2.5 text-xs font-medium text-gray-300 hover:bg-[#222222]"
                >
                  {lang === 'fa' ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#c5a47e] px-5 py-2.5 text-xs font-semibold text-black hover:bg-[#b3936d] shadow-lg shadow-[#c5a47e]/20"
                >
                  {lang === 'fa' ? 'ذخیره کاربر' : 'Save User'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
