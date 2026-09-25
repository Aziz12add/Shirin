import React from 'react';
import { 
  Shield, 
  Layers, 
  Users, 
  Radio, 
  Activity, 
  Database, 
  Copy, 
  Check, 
  ExternalLink,
  Globe,
  Sparkles,
  Server,
  LogOut,
  UserCheck
} from 'lucide-react';
import { UserAccount } from '../types';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  lang: 'fa' | 'en';
  setLang: (lang: 'fa' | 'en') => void;
  users: UserAccount[];
  appUrl: string;
  adminUsername?: string;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  lang,
  setLang,
  users,
  appUrl,
  adminUsername = 'admin',
  onLogout,
}) => {
  const [copied, setCopied] = React.useState(false);
  const primaryUser = users[0] || { token: 'sub_default_user' };
  const origin = typeof window !== 'undefined' ? window.location.origin : (appUrl || 'https://raypanel.app');
  const subUrl = `${origin}/sub/${primaryUser.token}`;

  const copyMainSub = () => {
    navigator.clipboard.writeText(subUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const navItems = [
    { id: 'dashboard', labelFa: 'پیشخوان مدیریتی', labelEn: 'Dashboard', icon: Activity },
    { id: 'configs', labelFa: 'کانفیگ‌ها (VLESS/Trojan)', labelEn: 'Configs', icon: Layers },
    { id: 'cleanIps', labelFa: 'مدیریت Clean IP', labelEn: 'Clean IPs', icon: Globe },
    { id: 'users', labelFa: 'کاربران و ساب‌اسکریپشن', labelEn: 'Users & Sub', icon: Users },
    { id: 'railway', labelFa: 'دیپلوی Wasmer و ابری', labelEn: 'Wasmer Deploy', icon: Radio },
    { id: 'traffic', labelFa: 'مانیتورینگ ترافیک', labelEn: 'Traffic Stats', icon: Sparkles },
    { id: 'database', labelFa: 'دیتابیس و بکاپ', labelEn: 'Database', icon: Database },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#222222] bg-[#0d0d0d]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
        
        {/* Logo & Brand */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c5a47e]/10 border border-[#c5a47e]/30 text-[#c5a47e] shadow-lg shadow-[#c5a47e]/10">
            <Shield className="h-5 w-5 stroke-[2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif text-xl font-medium tracking-tight text-white">
                Shirin / RayPanel
              </span>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-mono tracking-widest text-[#c5a47e] bg-[#c5a47e]/10 border border-[#c5a47e]/20">
                PRO 3.0
              </span>
            </div>
            <p className="text-[11px] text-gray-500 tracking-wide font-light">
              {lang === 'fa' 
                ? 'سرور پروکسی داخلی VLESS / Trojan و مدیریت هوشمند ساب‌اسکریپشن مهسا آن‌جی' 
                : 'Native VLESS & Trojan Proxy Server with MahsaNG Subscription Manager'}
            </p>
          </div>
        </div>

        {/* Quick Main Sub Action */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-[#222222] bg-[#141414] px-3.5 py-1.5 text-xs text-gray-300">
            <Server className="h-3.5 w-3.5 text-[#c5a47e]" />
            <span className="text-gray-500 text-[11px] uppercase tracking-wider">{lang === 'fa' ? 'ساب فعال:' : 'Active Sub:'}</span>
            <span className="font-mono text-[#c5a47e] max-w-[180px] truncate">{primaryUser.token}</span>
            <button
              id="btn-copy-navbar-sub"
              onClick={copyMainSub}
              className="ml-1 flex items-center gap-1 rounded bg-[#c5a47e]/15 border border-[#c5a47e]/30 px-2.5 py-1 text-[11px] font-medium text-[#c5a47e] hover:bg-[#c5a47e] hover:text-black transition-all"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-green-400" />
                  <span>{lang === 'fa' ? 'کپی شد' : 'Copied'}</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>{lang === 'fa' ? 'کپی لینک MahsaNG' : 'Copy Sub'}</span>
                </>
              )}
            </button>
          </div>

          {/* Admin User Badge */}
          {adminUsername && (
            <div className="flex items-center gap-1.5 rounded-lg border border-[#262626] bg-[#121212] px-3 py-1.5 text-xs text-gray-300">
              <UserCheck className="h-3.5 w-3.5 text-[#c5a47e]" />
              <span className="font-mono text-white">{adminUsername}</span>
            </div>
          )}

          {/* Language Switcher */}
          <button
            id="btn-switch-lang"
            onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
            className="flex items-center gap-1.5 rounded-lg border border-[#222222] bg-[#141414] px-3 py-1.5 text-xs font-medium text-gray-300 hover:border-[#c5a47e]/40 hover:text-white transition-all"
          >
            <Globe className="h-3.5 w-3.5 text-[#c5a47e]" />
            <span>{lang === 'fa' ? 'English' : 'فارسی'}</span>
          </button>

          {/* Logout Button */}
          {onLogout && (
            <button
              onClick={onLogout}
              title={lang === 'fa' ? 'خروج از حساب ادمین' : 'Log Out'}
              className="flex items-center gap-1 rounded-lg border border-rose-900/30 bg-rose-950/20 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950/50 hover:text-rose-200 transition-all"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{lang === 'fa' ? 'خروج' : 'Logout'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-t border-[#1a1a1a] bg-[#111111]/80">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto px-4 py-2 sm:px-6 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs transition-all ${
                  isActive
                    ? 'bg-[#c5a47e]/15 text-[#c5a47e] border border-[#c5a47e]/30 shadow-sm shadow-[#c5a47e]/5 font-medium'
                    : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200 border border-transparent font-light'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-[#c5a47e]' : 'text-gray-500'}`} />
                <span>{lang === 'fa' ? item.labelFa : item.labelEn}</span>
              </button>
            );
          })}

          <div className="ml-auto flex lg:hidden items-center gap-2">
            <button
              onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
              className="flex items-center gap-1 rounded border border-[#222222] bg-[#141414] px-2.5 py-1 text-xs text-gray-300"
            >
              <Globe className="h-3 w-3 text-[#c5a47e]" />
              <span>{lang === 'fa' ? 'EN' : 'فا'}</span>
            </button>

            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1 rounded border border-rose-900/40 bg-rose-950/20 px-2.5 py-1 text-xs text-rose-300"
              >
                <LogOut className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
