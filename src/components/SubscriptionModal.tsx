import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  X, 
  Copy, 
  Check, 
  Smartphone, 
  QrCode, 
  Link as LinkIcon, 
  Code, 
  ShieldCheck, 
  Clock, 
  HardDrive,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { UserAccount, ProxyConfig } from '../types';
import { generateSubscriptionBase64, generateConfigUri, formatBytes } from '../utils/configParsers';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount;
  configs: ProxyConfig[];
  lang: 'fa' | 'en';
  appUrl: string;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  user,
  configs,
  lang,
  appUrl,
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'subUrl' | 'base64' | 'rawLinks'>('subUrl');

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : (appUrl || 'https://raypanel.app');
  const subUrl = `${origin}/sub/${user.token}`;
  
  // Filter active and user allowed configs
  let allowedConfigs = configs.filter(c => c.active);
  if (!user.allowedConfigs.includes('all')) {
    allowedConfigs = allowedConfigs.filter(c => user.allowedConfigs.includes(c.id));
  }

  const base64Content = generateSubscriptionBase64(allowedConfigs);
  const rawLinksContent = allowedConfigs.map(generateConfigUri).join('\n');
  const totalUsedBytes = user.usedUploadBytes + user.usedDownloadBytes;
  const maxBytes = user.quotaGB * 1024 * 1024 * 1024;
  const usagePercentage = Math.min(100, Math.round((totalUsedBytes / maxBytes) * 100)) || 0;
  
  const isExpired = new Date(user.expireAt).getTime() < Date.now();
  const daysLeft = Math.max(0, Math.ceil((new Date(user.expireAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#131313] shadow-2xl shadow-black">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222222] bg-[#0d0d0d] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c5a47e]/10 text-[#c5a47e] border border-[#c5a47e]/20">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-white font-medium">
                {lang === 'fa' ? 'لینک اشتراک و اتصال به مهسا آن‌جی' : 'MahsaNG Subscription & QR'}
              </h3>
              <p className="text-xs text-gray-500">
                {lang === 'fa' ? `اکانت کاربر: ${user.username}` : `User Account: ${user.username}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-[#222222] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* User Quota & Validity Status Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-3">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <HardDrive className="h-3.5 w-3.5 text-[#c5a47e]" />
                <span>{lang === 'fa' ? 'حجم مصرفی' : 'Traffic Used'}</span>
              </div>
              <div className="text-sm font-medium text-white font-mono">
                {formatBytes(totalUsedBytes)} / {user.quotaGB} GB
              </div>
              <div className="mt-2 h-1.5 w-full bg-[#1c1c1c] rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${usagePercentage > 90 ? 'bg-rose-500' : 'bg-[#c5a47e]'}`} 
                  style={{ width: `${usagePercentage}%` }}
                />
              </div>
            </div>

            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-3">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <Clock className="h-3.5 w-3.5 text-[#c5a47e]" />
                <span>{lang === 'fa' ? 'اعتبار زمانی' : 'Validity'}</span>
              </div>
              <div className="text-sm font-medium text-white">
                {isExpired ? (
                  <span className="text-rose-400">{lang === 'fa' ? 'منقضی شده' : 'Expired'}</span>
                ) : (
                  <span className="text-[#c5a47e] font-mono">
                    {daysLeft} {lang === 'fa' ? 'روز باقی‌مانده' : 'days left'}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-gray-600 mt-1 truncate">
                {new Date(user.expireAt).toLocaleDateString()}
              </div>
            </div>

            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-3">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <ShieldCheck className="h-3.5 w-3.5 text-[#c5a47e]" />
                <span>{lang === 'fa' ? 'کانفیگ‌های فعال' : 'Active Nodes'}</span>
              </div>
              <div className="text-sm font-medium text-[#c5a47e] font-mono">
                {allowedConfigs.length} {lang === 'fa' ? 'نود اختصاصی' : 'Nodes'}
              </div>
              <div className="text-[11px] text-gray-600 mt-1">
                {lang === 'fa' ? 'VLESS / Trojan / HTTP' : 'VLESS / Trojan / HTTP'}
              </div>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="flex flex-col sm:flex-row items-center gap-6 rounded-xl border border-[#c5a47e]/20 bg-[#0e0e0e] p-5">
            <div className="flex flex-col items-center p-3 bg-white rounded-xl shadow-xl shadow-black">
              <QRCodeSVG 
                value={subUrl} 
                size={160} 
                level="M"
                includeMargin={false}
              />
              <span className="mt-2 text-[10px] font-bold text-black tracking-widest uppercase">
                SCAN WITH MAHSANG
              </span>
            </div>

            <div className="space-y-3 flex-1 text-center sm:text-start">
              <div className="inline-flex items-center gap-1.5 rounded bg-[#c5a47e]/10 px-3 py-1 text-xs font-medium text-[#c5a47e] border border-[#c5a47e]/20">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{lang === 'fa' ? 'آماده برای اتصال فوری در مهسا آن‌جی' : 'Ready for Instant Import'}</span>
              </div>
              <h4 className="text-sm font-serif font-medium text-white">
                {lang === 'fa' ? 'نحوه ایمپورت در مهسا آن‌جی (MahsaNG) یا V2rayNG:' : 'How to import into MahsaNG or V2rayNG:'}
              </h4>
              <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside">
                <li>
                  {lang === 'fa' 
                    ? 'دوربین گوشی را باز کنید و کد QR بالا را در مهسا آن‌جی اسکن کنید.' 
                    : 'Scan the QR code directly using the MahsaNG / V2rayNG camera scanner.'}
                </li>
                <li>
                  {lang === 'fa'
                    ? 'یا لینک ساب‌اسکریپشن زیر را کپی کرده و در بخش Subscription Group اضافه کنید.'
                    : 'Or copy the subscription URL below and add as a Subscription Group.'}
                </li>
                <li>
                  {lang === 'fa'
                    ? 'کانفیگ‌ها خودکار به‌روزرسانی شده و حجم مصرفی را نمایش می‌دهند.'
                    : 'Configs will auto-refresh and display real-time traffic statistics.'}
                </li>
              </ul>
            </div>
          </div>

          {/* Format Selector Tabs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-gray-400 font-medium">
                {lang === 'fa' ? 'فرمت خروجی اشتراک:' : 'Subscription Output Format:'}
              </label>
              <div className="flex items-center gap-1 rounded-lg bg-[#0a0a0a] p-1 border border-[#222222]">
                <button
                  id="tab-sub-url"
                  onClick={() => setViewMode('subUrl')}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all ${
                    viewMode === 'subUrl'
                      ? 'bg-[#c5a47e] text-black font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  <span>{lang === 'fa' ? 'لینک ساب (Sub URL)' : 'Sub URL'}</span>
                </button>
                <button
                  id="tab-sub-base64"
                  onClick={() => setViewMode('base64')}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all ${
                    viewMode === 'base64'
                      ? 'bg-[#c5a47e] text-black font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Code className="h-3.5 w-3.5" />
                  <span>{lang === 'fa' ? 'کد Base64' : 'Base64'}</span>
                </button>
                <button
                  id="tab-sub-raw"
                  onClick={() => setViewMode('rawLinks')}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all ${
                    viewMode === 'rawLinks'
                      ? 'bg-[#c5a47e] text-black font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>{lang === 'fa' ? 'لیست کانفیگ‌ها' : 'Raw List'}</span>
                </button>
              </div>
            </div>

            {/* Display Box */}
            <div className="relative rounded-lg border border-[#222222] bg-[#0a0a0a] p-3 font-mono text-xs text-gray-300">
              {viewMode === 'subUrl' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[#c5a47e] select-all font-medium">{subUrl}</span>
                  <button
                    id="btn-copy-suburl"
                    onClick={() => handleCopy(subUrl, 'subUrl')}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#c5a47e] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#b3936d] transition-colors"
                  >
                    {copiedType === 'subUrl' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>{lang === 'fa' ? 'کپی شد' : 'Copied'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>{lang === 'fa' ? 'کپی لینک ساب' : 'Copy URL'}</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {viewMode === 'base64' && (
                <div>
                  <textarea
                    readOnly
                    value={base64Content}
                    rows={4}
                    className="w-full bg-transparent text-gray-300 outline-none resize-none scrollbar-thin select-all"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      id="btn-copy-base64"
                      onClick={() => handleCopy(base64Content, 'base64')}
                      className="flex items-center gap-1.5 rounded-lg bg-[#c5a47e] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#b3936d]"
                    >
                      {copiedType === 'base64' ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>{lang === 'fa' ? 'کپی شد' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>{lang === 'fa' ? 'کپی کد Base64' : 'Copy Base64'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {viewMode === 'rawLinks' && (
                <div>
                  <textarea
                    readOnly
                    value={rawLinksContent}
                    rows={4}
                    className="w-full bg-transparent text-gray-300 outline-none resize-none scrollbar-thin select-all"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      id="btn-copy-raw"
                      onClick={() => handleCopy(rawLinksContent, 'raw')}
                      className="flex items-center gap-1.5 rounded-lg bg-[#c5a47e] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#b3936d]"
                    >
                      {copiedType === 'raw' ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>{lang === 'fa' ? 'کپی شد' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>{lang === 'fa' ? 'کپی کانفیگ‌ها' : 'Copy All Links'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick MahsaNG deep link tip */}
          <div className="rounded-lg border border-[#c5a47e]/20 bg-[#161616] p-3.5 text-xs text-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 shrink-0 text-[#c5a47e]" />
              <span>
                {lang === 'fa'
                  ? 'قابلیت افزودن ساب‌اسکریپشن در تمام کلاینت‌های MahsaNG, V2rayNG, Streisand, NekoBox, Shadowrocket'
                  : 'Fully compatible with MahsaNG, V2rayNG, Streisand, NekoBox & Shadowrocket'}
              </span>
            </div>
            <a
              href={`v2rayng://install-sub?url=${encodeURIComponent(subUrl)}`}
              className="flex items-center gap-1 text-[11px] font-medium text-[#c5a47e] underline hover:text-white"
            >
              <span>{lang === 'fa' ? 'باز کردن مستقیم' : 'Open in App'}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-[#222222] bg-[#0d0d0d] px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-2 text-xs font-medium text-gray-300 hover:bg-[#222222] transition-colors"
          >
            {lang === 'fa' ? 'بستن پنجره' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
};
