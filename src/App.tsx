import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { ConfigManager } from './components/ConfigManager';
import { UserManager } from './components/UserManager';
import { RailwayDeployGuide } from './components/RailwayDeployGuide';
import { TrafficSimulator } from './components/TrafficSimulator';
import { DatabaseSettings } from './components/DatabaseSettings';
import { SubscriptionModal } from './components/SubscriptionModal';
import { ProxyConfig, UserAccount, SystemStats, DatabaseSettings as IDatabaseSettings } from './types';
import confetti from 'canvas-confetti';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [lang, setLang] = useState<'fa' | 'en'>('fa');
  const [configs, setConfigs] = useState<ProxyConfig[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
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

  // App URL from window
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // 1. Fetch initial data from server
  const fetchAllData = async () => {
    try {
      const [configsRes, usersRes, statsRes] = await Promise.all([
        fetch('/api/configs'),
        fetch('/api/users'),
        fetch('/api/stats'),
      ]);

      if (configsRes.ok) {
        const data = await configsRes.json();
        if (data.configs) setConfigs(data.configs);
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        if (data.users) setUsers(data.users);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        if (data.stats) {
          setStats(data.stats);
          if (data.stats.settings) setDbSettings(data.stats.settings);
        }
      }
    } catch (err) {
      console.error('Error fetching data from API:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // 2. Config Actions
  const handleSaveConfig = async (newConfig: ProxyConfig) => {
    const isEdit = configs.some(c => c.id === newConfig.id);
    const method = isEdit ? 'PUT' : 'POST';
    const endpoint = isEdit ? `/api/configs/${newConfig.id}` : '/api/configs';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
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
      await fetch(`/api/configs/${id}`, { method: 'DELETE' });
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

  // 3. User Actions
  const handleSaveUser = async (newUser: UserAccount) => {
    const isEdit = users.some(u => u.id === newUser.id);
    const method = isEdit ? 'PUT' : 'POST';
    const endpoint = isEdit ? `/api/users/${newUser.id}` : '/api/users';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
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
      await fetch(`/api/users/${id}`, { method: 'DELETE' });
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
      const res = await fetch(`/api/users/${id}/reset-traffic`, { method: 'POST' });
      const data = await res.json();
      if (data.user) {
        setUsers(prev => prev.map(u => u.id === id ? data.user : u));
      }
    } catch (err) {
      console.error('Failed to reset traffic:', err);
    }
  };

  // 4. Traffic Logging Action
  const handleLogTraffic = async (userId: string, uploadMB: number, downloadMB: number, configId: string) => {
    try {
      const res = await fetch('/api/traffic/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, uploadMB, downloadMB, configId }),
      });
      const data = await res.json();
      if (data.user) {
        setUsers(prev => prev.map(u => u.id === userId ? data.user : u));
      }
    } catch (err) {
      console.error('Failed to log traffic:', err);
    }
  };

  // 5. Database Actions
  const handleSaveDbSettings = async (newSettings: Partial<IDatabaseSettings>) => {
    try {
      const res = await fetch('/api/database/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      const data = await res.json();
      if (data.settings) setDbSettings(data.settings);
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
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <div 
      dir={lang === 'fa' ? 'rtl' : 'ltr'} 
      className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans antialiased selection:bg-[#c5a47e] selection:text-black"
    >
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
        setLang={setLang}
        users={users}
        appUrl={appUrl}
      />

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex items-center gap-3 text-[#c5a47e] text-sm font-semibold">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#c5a47e] border-t-transparent" />
              <span>{lang === 'fa' ? 'در حال بارگذاری پایگاه داده...' : 'Loading RayPanel...'}</span>
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
                onSaveConfig={handleSaveConfig}
                onDeleteConfig={handleDeleteConfig}
                onToggleConfig={handleToggleConfig}
                onOpenQr={handleOpenConfigQr}
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
                onLogTraffic={handleLogTraffic}
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
