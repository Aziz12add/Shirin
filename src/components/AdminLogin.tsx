import React, { useState } from 'react';
import { Shield, Lock, User, KeyRound, ArrowRight, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';

interface AdminLoginProps {
  onLogin: (token: string, username: string) => void;
  lang: 'fa' | 'en';
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin, lang }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();
      if (res.ok && data.token) {
        onLogin(data.token, data.username);
      } else {
        setError(data.message || (lang === 'fa' ? 'نام کاربری یا رمز عبور اشتباه است.' : 'Invalid credentials.'));
      }
    } catch (err) {
      setError(lang === 'fa' ? 'خطا در برقراری ارتباط با سرور' : 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
      className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4 py-12 relative overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#c5a47e]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md rounded-2xl border border-[#262626] bg-[#121212]/90 backdrop-blur-xl p-8 shadow-2xl shadow-black relative z-10 space-y-6">
        
        {/* Header & Logo */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#c5a47e]/15 border border-[#c5a47e]/30 text-[#c5a47e] shadow-lg shadow-[#c5a47e]/10">
            <Shield className="h-7 w-7 stroke-[2]" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-light tracking-wide text-white">
              Shirin / RayPanel
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              {lang === 'fa' ? 'ورود به پنل مدیریت سرور پروکسی و ساب‌اسکریپشن' : 'Admin Sign In to Proxy & Sub Management'}
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-950/40 border border-rose-800/50 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-300">
              {lang === 'fa' ? 'نام کاربری ادمین' : 'Admin Username'}
            </label>
            <div className="relative">
              <User className="absolute right-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] py-2.5 pl-3 pr-9 text-xs text-white placeholder-gray-600 focus:border-[#c5a47e] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-300">
              {lang === 'fa' ? 'رمز عبور ادمین' : 'Password'}
            </label>
            <div className="relative">
              <KeyRound className="absolute right-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] py-2.5 pl-3 pr-9 text-xs text-white placeholder-gray-600 focus:border-[#c5a47e] focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#c5a47e] py-3 text-xs font-semibold text-black shadow-lg shadow-[#c5a47e]/20 hover:bg-[#b3936d] transition-all disabled:opacity-50"
          >
            {loading ? (
              <span>{lang === 'fa' ? 'در حال بررسی...' : 'Authenticating...'}</span>
            ) : (
              <>
                <span>{lang === 'fa' ? 'ورود به پنل' : 'Sign In'}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

        </form>

        {/* Credentials Hint */}
        <div className="rounded-xl border border-[#222] bg-[#0e0e0e] p-3 text-[11px] text-gray-400 space-y-1">
          <div className="flex items-center gap-1.5 text-[#c5a47e] font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{lang === 'fa' ? 'اطلاعات پیش‌فرض سیستم:' : 'Default Credentials:'}</span>
          </div>
          <p className="font-mono text-gray-300">
            یوزرنیم: <span className="text-white">admin</span> | رمز: <span className="text-white">admin123</span>
          </p>
          <p className="text-[10px] text-gray-500">
            {lang === 'fa' 
              ? 'می‌توانید با متغیرهای ADMIN_USER و ADMIN_PASS در Wasmer یا ریلوی آن را تغییر دهید.' 
              : 'Configurable via ADMIN_USER and ADMIN_PASS environment variables.'}
          </p>
        </div>

      </div>
    </div>
  );
};
