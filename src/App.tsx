import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { ConfigManager } from './components/ConfigManager';
import { CleanIpManager } from './components/CleanIpManager';
import { UserManager } from './components/UserManager';
import { RailwayDeployGuide } from './components/RailwayDeployGuide';
import { TrafficSimulator } from './components/TrafficSimulator';
import { DatabaseSettings } from './components/DatabaseSettings';
import { SubscriptionModal } from './components/SubscriptionModal';
import { AdminLogin } from './components/AdminLogin';
import { 
  ProxyConfig, 
  UserAccount, 
  CleanIpEntry, 
  SystemStats, 
  DatabaseSettings as IDatabaseSettings 
} from './types';
import confetti from 'canvas-confetti';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [lang, setLang] = useState<'fa' | 'en'>('fa');

  // Admin Auth State
  const [authToken, setAuthToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('shirin_admin_token') : null;
  });
  const [adminUser, setAdminUser] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  // Core Data State
  const [configs, setConfigs] = useState<ProxyConfig[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [cleanIps, setCleanIps] = useState<CleanIpEntry[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [dbSettings, setDbSettings] = useState<IDatabaseSettings>({
    type: 'local_json',
    status: 'connected',
    autoBackup: true,
  });

  // Modal State
  const [selectedSubUser, setSelectedSubUser] = useState<UserAccount | null>(null);
  const [isSubModalOpen, setIsSubModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Auth Headers helper
  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
  }, [authToken]);

  // Verify Admin Session on mount / token change
  useEffect(() => {
    const verifyAuth = async () => {
      if (!authToken) {
        setIsAuthChecking(false);
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.authenticated) {
          setAdminUser(data.username || 'admin');
        } else {
          setAuthToken(null);
          localStorage.removeItem('shirin_admin_token');
        }
      } catch (err) {
        console.error('Failed to verify token:', err);
      } finally {
        setIsAuthChecking(false);
      }
    };

    verifyAuth();
  }, [authToken]);

  // Fetch all core data
  const fetchAllData = useCallback(async () => {
    if (!authToken) return;

    try {
      const headers = getAuthHeaders();
      const [configsRes, usersRes, cleanIpsRes, statsRes] = await Promise.all([
        fetch('/api/configs', { headers }),
        fetch('/api/users', { headers }),
        fetch('/api/clean-ips', { headers }),
        fetch('/api/stats', { headers }),
      ]);

      if (configsRes.ok) {
        const data = await configsRes.json();
        if (data.configs) setConfigs(data.configs);
      } else if (configsRes.status === 401) {
        setAuthToken(null);
        localStorage.removeItem('shirin_admin_token');
        return;
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        if (data.users) setUsers(data.users);
      }

      if (cleanIpsRes.ok) {
        const data = await cleanIpsRes.json();
        if (data.cleanIps) setCleanIps(data.cleanIps);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching data from API:', err);
    } finally {
      setIsLoading(false);
    }
  }, [authToken, getAuthHeaders]);

  useEffect(() => {
    if (authToken) {
      fetchAllData();
    }
  }, [authToken, fetchAllData]);

  // Periodic Live Stats Polling (every 3 seconds for real-time proxy metrics)
  useEffect(() => {
    if (!authToken) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/stats', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (data.stats) setStats(data.stats);
        }
      } catch (err) {
        // quiet error
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [authToken, getAuthHeaders]);

  // Login handler
  const handleLoginSuccess = (token: string, username: string) => {
    localStorage.setItem('shirin_admin_token', token);
    setAuthToken(token);
    setAdminUser(username);
    setIsLoading(true);
    confetti({ particleCount: 40, spread: 70, origin: { y: 0.6 } });
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      if (authToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: getAuthHeaders()
        });
      }
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('shirin_admin_token');
    setAuthToken(null);
    setAdminUser(null);
    setActiveTab('dashboard');
  };

  // --- Config Actions ---
  const handleSaveConfig = async (newConfig: ProxyConfig) => {
    const isEdit = configs.some(c => c.id === newConfig.id);
    const method = isEdit ? 'PUT' : 'POST';
    const endpoint = isEdit ? `/api/configs/${newConfig.id}` : '/api/configs';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(newConfig),
      });
      const data = await res.json();
      if (data.config) {
        if (isEdit) {
          setConfigs(prev => prev.map(c => c.id === newConfig.id ? data.config : c));
        } else {
          setConfigs(prev => [data.config, ...prev]);
          confetti({ particleCount: 30, spread: 60, origin: { y: 0.7 } });
        }
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

  const handleDeleteConfig = async (id: string) => {
    if (!confirm(lang === 'fa' ? 'آیا از حذف این کانفیگ مطمئن هستید؟' : 'Delete this config?')) return;
    try {
      await fetch(`/api/configs/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      setConfigs(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Failed to delete config:', err);
    }
  };

  const handleToggleConfig = async (id: string) => {
    const config = configs.find(c => c.id === id);
    if (!config) return;
    const updated = { ...config, active: !config.active };
    await handleSaveConfig(updated);
  };

  // --- User Actions ---
  const handleSaveUser = async (newUser: UserAccount) => {
    const isEdit = users.some(u => u.id === newUser.id);
    const method = isEdit ? 'PUT' : 'POST';
    const endpoint = isEdit ? `/api/users/${newUser.id}` : '/api/users';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (data.user) {
        if (isEdit) {
          setUsers(prev => prev.map(u => u.id === newUser.id ? data.user : u));
        } else {
          setUsers(prev => [data.user, ...prev]);
          confetti({ particleCount: 35, spread: 70, origin: { y: 0.7 } });
        }
      }
    } catch (err) {
      console.error('Failed to save user:', err);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm(lang === 'fa' ? 'آیا از حذف این کاربر مطمئن هستید؟' : 'Delete this user?')) return;
    try {
      await fetch(`/api/users/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
  };

  const handleToggleUser = async (id: string) => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    const updated = { ...user, active: !user.active };
    await handleSaveUser(updated);
  };

  const handleResetUserTraffic = async (id: string) => {
    try {
      const res = await fetch(`/api/users/${id}/reset-traffic`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.user) {
        setUsers(prev => prev.map(u => u.id === id ? data.user : u));
        fetchAllData();
      }
    } catch (err) {
      console.error('Failed to reset traffic:', err);
    }
  };

  // --- Clean IP Actions ---
  const handleSaveCleanIp = async (newIp: CleanIpEntry) => {
    const isEdit = cleanIps.some(ip => ip.id === newIp.id);
    const method = isEdit ? 'PUT' : 'POST';
    const endpoint = isEdit ? `/api/clean-ips/${newIp.id}` : '/api/clean-ips';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(newIp),
      });
      const data = await res.json();
      if (data.cleanIp) {
        if (isEdit) {
          setCleanIps(prev => prev.map(ip => ip.id === newIp.id ? data.cleanIp : ip));
        } else {
          setCleanIps(prev => [data.cleanIp, ...prev]);
          confetti({ particleCount: 25, spread: 60, origin: { y: 0.7 } });
        }
      }
    } catch (err) {
      console.error('Failed to save clean IP:', err);
    }
  };

  const handleDeleteCleanIp = async (id: string) => {
    if (!confirm(lang === 'fa' ? 'آیا از حذف این Clean IP مطمئن هستید؟' : 'Delete this Clean IP?')) return;
    try {
      await fetch(`/api/clean-ips/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      setCleanIps(prev => prev.filter(ip => ip.id !== id));
    } catch (err) {
      console.error('Failed to delete clean IP:', err);
    }
  };

  const handleTestCleanIpPing = async (id: string): Promise<number | null> => {
    try {
      const res = await fetch(`/api/clean-ips/${id}/ping`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.pingMs) {
        setCleanIps(prev => prev.map(ip => ip.id === id ? { ...ip, pingMs: data.pingMs } : ip));
        return data.pingMs;
      }
      return null;
    } catch (err) {
      return null;
    }
  };

  // --- Database Settings ---
  const handleSaveDbSettings = async (newSettings: Partial<IDatabaseSettings>) => {
    try {
      setDbSettings(prev => ({ ...prev, ...newSettings }));
    } catch (err) {
      console.error('Failed to update DB settings:', err);
    }
  };

  const handleExportDatabase = () => {
    window.open('/api/database/export', '_blank');
  };

  const handleImportDatabase = async (importedData: any) => {
    try {
      const res = await fetch('/api/database/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(importedData),
      });
      if (res.ok) {
        fetchAllData();
      }
    } catch (err) {
      console.error('Failed to import database:', err);
    }
  };

  // Open Sub Modal for User
  const handleOpenUserSub = (user: UserAccount) => {
    setSelectedSubUser(user);
    setIsSubModalOpen(true);
  };

  // Open Sub Modal from Config
  const handleOpenConfigQr = (config: ProxyConfig) => {
    const activeUser = users[0] || {
      id: 'default',
      username: 'default_user',
      token: 'sub_default',
      uuid: config.uuid || '00000000-0000-0000-0000-000000000000',
      quotaGB: 50,
      usedUploadBytes: 0,
      usedDownloadBytes: 0,
      expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      active: true,
      allowedConfigs: [config.id],
      createdAt: new Date().toISOString()
    };
    setSelectedSubUser({
      ...activeUser,
      allowedConfigs: [config.id]
    });
    setIsSubModalOpen(true);
  };

  // If Auth check still in progress
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#c5a47e] text-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#c5a47e] border-t-transparent" />
          <span>در حال بررسی دسترسی ادمین...</span>
        </div>
      </div>
    );
  }

  // If not authenticated, show Admin Login Screen
  if (!authToken) {
    return <AdminLogin onLogin={handleLoginSuccess} lang={lang} />;
  }

  return (
    <div 
      dir={lang === 'fa' ? 'rtl' : 'ltr'} 
      className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans antialiased selection:bg-[#c5a47e] selection:text-black"
    >
      {/* Top Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
        setLang={setLang}
        users={users}
        appUrl={appUrl}
        adminUsername={adminUser || 'admin'}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex items-center gap-3 text-[#c5a47e] text-sm font-semibold">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#c5a47e] border-t-transparent" />
              <span>{lang === 'fa' ? 'در حال بارگذاری سرور و پایگاه داده...' : 'Loading Shirin / RayPanel...'}</span>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardOverview
                stats={stats}
                configs={configs}
                users={users}
                onOpenSubModal={handleOpenUserSub}
                onNavigateTab={setActiveTab}
                lang={lang}
                appUrl={appUrl}
              />
            )}

            {activeTab === 'configs' && (
              <ConfigManager
                configs={configs}
                cleanIps={cleanIps}
                onSaveConfig={handleSaveConfig}
                onDeleteConfig={handleDeleteConfig}
                onToggleConfig={handleToggleConfig}
                onOpenQr={handleOpenConfigQr}
                lang={lang}
              />
            )}

            {activeTab === 'cleanIps' && (
              <CleanIpManager
                cleanIps={cleanIps}
                onSaveIp={handleSaveCleanIp}
                onDeleteIp={handleDeleteCleanIp}
                onTestPing={handleTestCleanIpPing}
                lang={lang}
              />
            )}

            {activeTab === 'users' && (
              <UserManager
                users={users}
                configs={configs}
                onSaveUser={handleSaveUser}
                onDeleteUser={handleDeleteUser}
                onResetTraffic={handleResetUserTraffic}
                onToggleUser={handleToggleUser}
                onOpenSubModal={handleOpenUserSub}
                lang={lang}
                appUrl={appUrl}
              />
            )}

            {activeTab === 'railway' && (
              <RailwayDeployGuide lang={lang} />
            )}

            {activeTab === 'traffic' && (
              <TrafficSimulator
                users={users}
                configs={configs}
                onLogTraffic={async (userId, upMB, downMB) => {
                  try {
                    await fetch('/api/stats', { headers: getAuthHeaders() });
                  } catch (e) {
                    // ignore
                  }
                }}
                onResetUserTraffic={handleResetUserTraffic}
                lang={lang}
              />
            )}

            {activeTab === 'database' && (
              <DatabaseSettings
                settings={dbSettings}
                onSaveSettings={handleSaveDbSettings}
                onExportDatabase={handleExportDatabase}
                onImportDatabase={handleImportDatabase}
                lang={lang}
              />
            )}
          </>
        )}
      </main>

      {/* Shared Subscription & MahsaNG QR Modal */}
      {selectedSubUser && (
        <SubscriptionModal
          isOpen={isSubModalOpen}
          onClose={() => {
            setIsSubModalOpen(false);
            setSelectedSubUser(null);
          }}
          user={selectedSubUser}
          configs={configs}
          lang={lang}
          appUrl={appUrl}
        />
      )}
    </div>
  );
}
