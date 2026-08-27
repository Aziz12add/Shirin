import React, { useState } from 'react';
import { 
  Plus, 
  Layers, 
  Copy, 
  Check, 
  Trash2, 
  Power, 
  QrCode, 
  Radio, 
  Globe, 
  Key, 
  Lock, 
  ArrowRight, 
  Sparkles,
  ExternalLink,
  Wifi,
  Shuffle,
  FileCode,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';
import { ProxyConfig, ProxyProtocol, TransportType, SecurityType } from '../types';
import { generateConfigUri, parseConfigUri } from '../utils/configParsers';

interface ConfigManagerProps {
  configs: ProxyConfig[];
  onSaveConfig: (config: ProxyConfig) => void;
  onDeleteConfig: (id: string) => void;
  onToggleConfig: (id: string) => void;
  onOpenQr: (config: ProxyConfig) => void;
  lang: 'fa' | 'en';
}

export const ConfigManager: React.FC<ConfigManagerProps> = ({
  configs,
  onSaveConfig,
  onDeleteConfig,
  onToggleConfig,
  onOpenQr,
  lang,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterProtocol, setFilterProtocol] = useState<string>('all');
  const [filterOperator, setFilterOperator] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rawImportInput, setRawImportInput] = useState('');
  const [isImportMode, setIsImportMode] = useState(false);

  // Form State for Adding / Editing
  const [formConfig, setFormConfig] = useState<Partial<ProxyConfig>>({
    name: '',
    protocol: 'vless',
    server: 'my-app.up.railway.app',
    port: 443,
    uuid: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    password: '',
    username: '',
    transport: 'ws',
    path: '/vless-railway',
    host: 'my-app.up.railway.app',
    sni: 'my-app.up.railway.app',
    security: 'tls',
    remark: '🇮🇷 Railway VLESS WS-TLS ⚡',
    operatorPreset: 'mci',
    cleanIp: '104.16.132.229',
    active: true,
  });

  const handleGenerateUUID = () => {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    setFormConfig(prev => ({ ...prev, uuid }));
  };

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 16; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormConfig(prev => ({ ...prev, password: pass }));
  };

  const handleApplyPreset = (type: 'railway_vless' | 'railway_trojan' | 'reality' | 'http_proxy') => {
    if (type === 'railway_vless') {
      setFormConfig(prev => ({
        ...prev,
        protocol: 'vless',
        name: 'Railway VLESS-WS (TLS)',
        server: 'my-app.up.railway.app',
        port: 443,
        transport: 'ws',
        path: '/vless-railway',
        host: 'my-app.up.railway.app',
        sni: 'my-app.up.railway.app',
        security: 'tls',
        remark: '🇮🇷 Railway VLESS WS ⚡ MCI/Irancell',
        operatorPreset: 'mci',
        cleanIp: '104.16.132.229'
      }));
    } else if (type === 'railway_trojan') {
      setFormConfig(prev => ({
        ...prev,
        protocol: 'trojan',
        name: 'Railway Trojan-WS (TLS)',
        server: 'my-app.up.railway.app',
        port: 443,
        password: 'RailwayPass_2026_SecureKey',
        transport: 'ws',
        path: '/trojan-railway',
        host: 'my-app.up.railway.app',
        sni: 'my-app.up.railway.app',
        security: 'tls',
        remark: '🇮🇷 Railway Trojan WS 🚀 Ultra Fast',
        operatorPreset: 'irancell',
        cleanIp: '162.159.136.232'
      }));
    } else if (type === 'reality') {
      setFormConfig(prev => ({
        ...prev,
        protocol: 'vless',
        name: 'VLESS Reality TCP Direct',
        server: '185.199.110.153',
        port: 443,
        transport: 'tcp',
        security: 'reality',
        realityPublicKey: 'Iq5dE8Z7yL4k-9Nm1xW3vP6qR8sT0uV2wX4yZ6aB8cD',
        realityShortId: '6ba7b810',
        spiderX: '/',
        flow: 'xtls-rprx-vision',
        sni: 'www.microsoft.com',
        remark: '🔒 VLESS Reality ⚡ Anti-Filter Direct',
        operatorPreset: 'all',
        cleanIp: ''
      }));
    } else if (type === 'http_proxy') {
      setFormConfig(prev => ({
        ...prev,
        protocol: 'http',
        name: 'HTTP Secure Proxy (Auth)',
        server: 'my-app.up.railway.app',
        port: 8080,
        username: 'rayuser',
        password: 'securePass7788',
        transport: 'tcp',
        security: 'none',
        remark: '🌐 HTTP Auth Proxy',
        operatorPreset: 'mokhaberat',
        cleanIp: ''
      }));
    }
  };

  const handleRawImport = () => {
    if (!rawImportInput.trim()) return;
    const parsed = parseConfigUri(rawImportInput.trim());
    if (parsed) {
      setFormConfig(prev => ({ ...prev, ...parsed }));
      setIsImportMode(false);
      setRawImportInput('');
    } else {
      alert(lang === 'fa' ? 'فرمت لینک نامعتبر است. لطفاً لینک VLESS یا Trojan صحیح وارد کنید.' : 'Invalid URI format.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const configToSave: ProxyConfig = {
      id: formConfig.id || `cfg-${Date.now()}`,
      name: formConfig.name || `${formConfig.protocol?.toUpperCase()} Node`,
      protocol: formConfig.protocol || 'vless',
      server: formConfig.server || '127.0.0.1',
      port: Number(formConfig.port) || 443,
      uuid: formConfig.uuid,
      password: formConfig.password,
      username: formConfig.username,
      transport: formConfig.transport || 'ws',
      path: formConfig.path || '/',
      host: formConfig.host,
      sni: formConfig.sni,
      security: formConfig.security || 'tls',
      alpn: formConfig.alpn,
      flow: formConfig.flow,
      realityPublicKey: formConfig.realityPublicKey,
      realityShortId: formConfig.realityShortId,
      spiderX: formConfig.spiderX,
      remark: formConfig.remark || formConfig.name || 'Node',
      operatorPreset: formConfig.operatorPreset || 'all',
      cleanIp: formConfig.cleanIp,
      active: formConfig.active ?? true,
      createdAt: formConfig.createdAt || new Date().toISOString(),
    };

    onSaveConfig(configToSave);
    setShowAddModal(false);
    setFormConfig({
      name: '',
      protocol: 'vless',
      server: 'my-app.up.railway.app',
      port: 443,
      uuid: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      transport: 'ws',
      path: '/vless-railway',
      host: 'my-app.up.railway.app',
      sni: 'my-app.up.railway.app',
      security: 'tls',
      remark: '🇮🇷 Railway VLESS WS-TLS ⚡',
      operatorPreset: 'mci',
      cleanIp: '104.16.132.229',
      active: true,
    });
  };

  const copyConfigUri = (config: ProxyConfig) => {
    const uri = generateConfigUri(config);
    navigator.clipboard.writeText(uri);
    setCopiedId(config.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredConfigs = configs.filter(c => {
    if (filterProtocol !== 'all' && c.protocol !== filterProtocol) return false;
    if (filterOperator !== 'all' && c.operatorPreset !== filterOperator) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.server.toLowerCase().includes(q) ||
        (c.remark && c.remark.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-light text-white flex items-center gap-2.5">
            <Layers className="h-5 w-5 text-[#c5a47e]" />
            <span>{lang === 'fa' ? 'مدیریت کانفیگ‌ها و پروتکل‌ها' : 'Proxy Configurations'}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {lang === 'fa' 
              ? 'ساخت و ویرایش کانفیگ‌های VLESS، Trojan، VMess و HTTP برای ریلوی و مهسا آن‌جی' 
              : 'Build and manage custom VLESS, Trojan, VMess and HTTP proxies for Railway & MahsaNG'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-open-add-config"
            onClick={() => {
              handleGenerateUUID();
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-[#c5a47e] px-4 py-2.5 text-xs font-semibold text-black shadow-lg shadow-[#c5a47e]/20 hover:bg-[#b3936d] transition-all"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>{lang === 'fa' ? '+ ساخت کانفیگ جدید' : '+ Create New Config'}</span>
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#222222] bg-[#141414] p-4">
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Protocol Filter */}
          <div className="flex items-center gap-1.5 rounded-lg bg-[#0e0e0e] px-3 py-1.5 border border-[#222222] text-xs">
            <Filter className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-gray-500">{lang === 'fa' ? 'پروتکل:' : 'Protocol:'}</span>
            <select
              value={filterProtocol}
              onChange={(e) => setFilterProtocol(e.target.value)}
              className="bg-transparent text-[#c5a47e] font-medium outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#161616] text-white">{lang === 'fa' ? 'همه پروتکل‌ها' : 'All'}</option>
              <option value="vless" className="bg-[#161616] text-white">VLESS</option>
              <option value="trojan" className="bg-[#161616] text-white">Trojan</option>
              <option value="http" className="bg-[#161616] text-white">HTTP Proxy</option>
              <option value="vmess" className="bg-[#161616] text-white">VMess</option>
            </select>
          </div>

          {/* Operator Filter */}
          <div className="flex items-center gap-1.5 rounded-lg bg-[#0e0e0e] px-3 py-1.5 border border-[#222222] text-xs">
            <Wifi className="h-3.5 w-3.5 text-[#c5a47e]" />
            <span className="text-gray-500">{lang === 'fa' ? 'اپراتور:' : 'Operator:'}</span>
            <select
              value={filterOperator}
              onChange={(e) => setFilterOperator(e.target.value)}
              className="bg-transparent text-[#c5a47e] font-medium outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#161616] text-white">{lang === 'fa' ? 'همه اپراتورها' : 'All'}</option>
              <option value="mci" className="bg-[#161616] text-white">{lang === 'fa' ? 'همراه اول (MCI)' : 'MCI'}</option>
              <option value="irancell" className="bg-[#161616] text-white">{lang === 'fa' ? 'ایرانسل (Irancell)' : 'Irancell'}</option>
              <option value="rightel" className="bg-[#161616] text-white">{lang === 'fa' ? 'رایتل (Rightel)' : 'Rightel'}</option>
              <option value="mokhaberat" className="bg-[#161616] text-white">{lang === 'fa' ? 'مخابرات / خانگی' : 'Home WiFi'}</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            placeholder={lang === 'fa' ? 'جستجوی کانفیگ...' : 'Search configs...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[#222222] bg-[#0e0e0e] pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-[#c5a47e]/50"
          />
        </div>
      </div>

      {/* Config Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredConfigs.map((config) => {
          const uri = generateConfigUri(config);
          const isCopied = copiedId === config.id;

          return (
            <div
              key={config.id}
              className={`group relative overflow-hidden rounded-xl border transition-all ${
                config.active
                  ? 'border-[#222222] bg-[#131313] hover:border-[#c5a47e]/40 shadow-lg shadow-black'
                  : 'border-[#1a1a1a] bg-[#0d0d0d] opacity-60'
              }`}
            >
              <div className="p-5 space-y-4">
                
                {/* Header info */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase border ${
                        config.protocol === 'vless' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        config.protocol === 'trojan' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                        config.protocol === 'http' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                        'bg-blue-500/10 text-blue-300 border-blue-500/20'
                      }`}>
                        {config.protocol}
                      </span>
                      <span className="rounded bg-[#1c1c1c] border border-[#2a2a2a] px-2 py-0.5 text-[10px] font-mono text-gray-400">
                        {config.transport.toUpperCase()} {config.security ? `• ${config.security.toUpperCase()}` : ''}
                      </span>
                      {config.operatorPreset && config.operatorPreset !== 'all' && (
                        <span className="rounded bg-[#c5a47e]/10 px-2 py-0.5 text-[10px] font-medium text-[#c5a47e] border border-[#c5a47e]/20">
                          {config.operatorPreset === 'mci' ? 'همراه اول' : config.operatorPreset === 'irancell' ? 'ایرانسل' : config.operatorPreset}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-sm font-medium text-white group-hover:text-[#c5a47e] transition-colors">
                      {config.name}
                    </h3>
                  </div>

                  {/* Active Switch */}
                  <button
                    onClick={() => onToggleConfig(config.id)}
                    className={`rounded-lg p-2 transition-colors ${
                      config.active
                        ? 'bg-[#c5a47e]/15 text-[#c5a47e] hover:bg-[#c5a47e]/25'
                        : 'bg-[#1a1a1a] text-gray-600 hover:bg-[#222222] hover:text-gray-400'
                    }`}
                    title={config.active ? 'Disable node' : 'Enable node'}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                </div>

                {/* Connection Specs */}
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-3 font-mono text-[11px]">
                  <div>
                    <span className="text-gray-600 block text-[10px] uppercase tracking-wider">HOST / DOMAIN</span>
                    <span className="text-gray-300 truncate block">{config.server}:{config.port}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block text-[10px] uppercase tracking-wider">PATH / SNI</span>
                    <span className="text-gray-300 truncate block">{config.path || config.sni || '/'}</span>
                  </div>
                  {config.cleanIp && (
                    <div className="col-span-2 border-t border-[#1a1a1a] pt-1.5 mt-0.5">
                      <span className="text-[#c5a47e] block text-[10px] uppercase tracking-wider">CLEAN IP (IRAN)</span>
                      <span className="text-[#c5a47e] truncate block">{config.cleanIp}</span>
                    </div>
                  )}
                </div>

                {/* Remark / Description */}
                {config.remark && (
                  <p className="text-xs text-gray-500 truncate font-light">
                    {config.remark}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between border-t border-[#1e1e1e] pt-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onOpenQr(config)}
                      className="flex items-center gap-1 rounded-lg border border-[#262626] bg-[#161616] px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:border-[#c5a47e]/40 hover:text-[#c5a47e] transition-colors"
                    >
                      <QrCode className="h-3.5 w-3.5 text-[#c5a47e]" />
                      <span>{lang === 'fa' ? 'کد QR' : 'QR'}</span>
                    </button>
                    <button
                      onClick={() => copyConfigUri(config)}
                      className="flex items-center gap-1 rounded-lg border border-[#262626] bg-[#161616] px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:border-[#c5a47e]/40 hover:text-[#c5a47e] transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-green-400" />
                          <span className="text-green-400">{lang === 'fa' ? 'کپی شد' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>{lang === 'fa' ? 'کپی لینک' : 'Copy'}</span>
                        </>
                      )}
                    </button>
                    <a
                      href={`v2rayng://install-config?url=${encodeURIComponent(uri)}`}
                      className="flex items-center gap-1 rounded-lg border border-[#262626] bg-[#161616] px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:border-[#c5a47e]/40 hover:text-[#c5a47e] transition-colors"
                      title="Open in MahsaNG / V2rayNG"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-[#c5a47e]" />
                      <span className="hidden sm:inline">{lang === 'fa' ? 'مهسا آن‌جی' : 'MahsaNG'}</span>
                    </a>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setFormConfig(config);
                        setShowAddModal(true);
                      }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-[#222222] hover:text-white transition-colors text-xs"
                    >
                      {lang === 'fa' ? 'ویرایش' : 'Edit'}
                    </button>
                    <button
                      onClick={() => onDeleteConfig(config.id)}
                      className="rounded-lg p-1.5 text-gray-600 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {filteredConfigs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#222222] bg-[#111111] p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-gray-700 mb-3" />
          <h3 className="text-base font-serif text-white">
            {lang === 'fa' ? 'هیچ کانفیگی یافت نشد' : 'No Configurations Found'}
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            {lang === 'fa'
              ? 'روی دکمه "ساخت کانفیگ جدید" کلیک کنید یا از قالب‌های آماده ریلوی استفاده کنید.'
              : 'Create a new VLESS or Trojan config to get started.'}
          </p>
        </div>
      )}

      {/* Add / Edit Config Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#131313] shadow-2xl shadow-black">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#222222] bg-[#0d0d0d] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c5a47e]/10 text-[#c5a47e] border border-[#c5a47e]/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg text-white font-medium">
                    {formConfig.id ? (lang === 'fa' ? 'ویرایش کانفیگ' : 'Edit Config') : (lang === 'fa' ? 'ساخت کانفیگ جدید' : 'Create New Config')}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {lang === 'fa' ? 'پروتکل‌های پشتیبانی شده: VLESS, Trojan, VMess, HTTP' : 'Supported: VLESS, Trojan, VMess, HTTP'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportMode(!isImportMode)}
                  className="rounded-lg border border-[#333333] bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-gray-300 hover:border-[#c5a47e]/40 hover:text-[#c5a47e]"
                >
                  <FileCode className="inline h-3.5 w-3.5 mr-1 text-[#c5a47e]" />
                  {lang === 'fa' ? 'ایمپورت لینک خام' : 'Import Raw URI'}
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-[#222222] hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Quick Import Sub-Panel */}
            {isImportMode && (
              <div className="bg-[#0a0a0a] border-b border-[#222222] p-4 space-y-2">
                <label className="text-xs font-medium text-[#c5a47e]">
                  {lang === 'fa' ? 'لینک vless:// یا trojan:// خود را پیست کنید:' : 'Paste your vless:// or trojan:// URI:'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rawImportInput}
                    onChange={(e) => setRawImportInput(e.target.value)}
                    placeholder="vless://xxxx-xxxx@example.com:443?type=ws&security=tls&path=/ws#Remark"
                    className="flex-1 rounded-lg border border-[#262626] bg-[#141414] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                  <button
                    onClick={handleRawImport}
                    className="rounded-lg bg-[#c5a47e] px-4 py-2 text-xs font-semibold text-black hover:bg-[#b3936d]"
                  >
                    {lang === 'fa' ? 'آنالیز و پر کردن فیلدها' : 'Parse & Fill'}
                  </button>
                </div>
              </div>
            )}

            {/* Presets Bar */}
            <div className="bg-[#0d0d0d] border-b border-[#222222] px-6 py-2.5 flex items-center gap-2 overflow-x-auto">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 whitespace-nowrap">
                {lang === 'fa' ? 'قالب‌های سریع ریلوی:' : 'Quick Presets:'}
              </span>
              <button
                type="button"
                onClick={() => handleApplyPreset('railway_vless')}
                className="whitespace-nowrap rounded-lg bg-[#1a1a1a] px-2.5 py-1 text-xs font-medium text-blue-400 hover:bg-blue-950/40 border border-blue-500/20"
              >
                ⚡ Railway VLESS-WS
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('railway_trojan')}
                className="whitespace-nowrap rounded-lg bg-[#1a1a1a] px-2.5 py-1 text-xs font-medium text-purple-400 hover:bg-purple-950/40 border border-purple-500/20"
              >
                🚀 Railway Trojan-WS
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('reality')}
                className="whitespace-nowrap rounded-lg bg-[#1a1a1a] px-2.5 py-1 text-xs font-medium text-[#c5a47e] hover:bg-[#c5a47e]/10 border border-[#c5a47e]/30"
              >
                🔒 VLESS Reality TCP
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('http_proxy')}
                className="whitespace-nowrap rounded-lg bg-[#1a1a1a] px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-950/40 border border-amber-500/20"
              >
                🌐 HTTP Auth Proxy
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              
              {/* Protocol & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'پروتکل (Protocol)' : 'Protocol'}
                  </label>
                  <select
                    value={formConfig.protocol}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, protocol: e.target.value as ProxyProtocol }))}
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-medium outline-none focus:border-[#c5a47e]"
                  >
                    <option value="vless">VLESS (پیشنهادی ریلوی و مهسا آن‌جی)</option>
                    <option value="trojan">Trojan (استاندارد ضد فیلتر)</option>
                    <option value="http">HTTP Proxy (ساده و پرسرعت)</option>
                    <option value="vmess">VMess</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'نام نمایشی کانفیگ' : 'Config Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formConfig.name}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="مثال: Railway VLESS MCI Fast"
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white outline-none focus:border-[#c5a47e]"
                  />
                </div>
              </div>

              {/* Server, Port & Clean IP */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'آدرس سرور یا دامنه ریلوی (Server / Domain)' : 'Server / Railway Domain'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formConfig.server}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, server: e.target.value }))}
                    placeholder="my-app.up.railway.app"
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'پورت (Port)' : 'Port'}
                  </label>
                  <input
                    type="number"
                    required
                    value={formConfig.port}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, port: parseInt(e.target.value) }))}
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                </div>
              </div>

              {/* Operator Clean IP & Preset */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'تنظیم برای اپراتور' : 'Operator Target'}
                  </label>
                  <select
                    value={formConfig.operatorPreset}
                    onChange={(e) => {
                      const op = e.target.value as any;
                      let cleanIp = formConfig.cleanIp;
                      if (op === 'mci') cleanIp = '104.16.132.229';
                      else if (op === 'irancell') cleanIp = '162.159.136.232';
                      else if (op === 'rightel') cleanIp = '104.19.141.15';
                      setFormConfig(prev => ({ ...prev, operatorPreset: op, cleanIp }));
                    }}
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white outline-none focus:border-[#c5a47e]"
                  >
                    <option value="all">{lang === 'fa' ? 'همه اپراتورها (پیش‌فرض)' : 'All Networks'}</option>
                    <option value="mci">{lang === 'fa' ? 'همراه اول (MCI)' : 'MCI'}</option>
                    <option value="irancell">{lang === 'fa' ? 'ایرانسل (Irancell)' : 'Irancell'}</option>
                    <option value="rightel">{lang === 'fa' ? 'رایتل (Rightel)' : 'Rightel'}</option>
                    <option value="mokhaberat">{lang === 'fa' ? 'مخابرات / اینترنت خانگی' : 'Home WiFi'}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'آی‌پی تمیز کلودفلر (Clean IP - اختیاری)' : 'Clean IP (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={formConfig.cleanIp || ''}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, cleanIp: e.target.value }))}
                    placeholder="104.16.132.229"
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                </div>
              </div>

              {/* UUID / Password Keys */}
              {formConfig.protocol === 'vless' || formConfig.protocol === 'vmess' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-300">
                      {lang === 'fa' ? 'شناسه کاربر (UUID)' : 'User UUID'}
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateUUID}
                      className="text-[11px] text-[#c5a47e] hover:text-[#b3936d] flex items-center gap-1 font-medium"
                    >
                      <Shuffle className="h-3 w-3" />
                      {lang === 'fa' ? 'تولید UUID جدید' : 'Generate UUID'}
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={formConfig.uuid || ''}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, uuid: e.target.value }))}
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                </div>
              ) : formConfig.protocol === 'trojan' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-300">
                      {lang === 'fa' ? 'رمز عبور تروجان (Password)' : 'Trojan Password'}
                    </label>
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="text-[11px] text-[#c5a47e] hover:text-[#b3936d] flex items-center gap-1 font-medium"
                    >
                      <Key className="h-3 w-3" />
                      {lang === 'fa' ? 'تولید رمز قوی' : 'Generate Strong Password'}
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={formConfig.password || ''}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-300 block mb-1.5">نام کاربری (Username)</label>
                    <input
                      type="text"
                      value={formConfig.username || ''}
                      onChange={(e) => setFormConfig(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-300 block mb-1.5">رمز عبور (Password)</label>
                    <input
                      type="text"
                      value={formConfig.password || ''}
                      onChange={(e) => setFormConfig(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                    />
                  </div>
                </div>
              )}

              {/* Transport & Security */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'نوع انتقال (Transport)' : 'Transport'}
                  </label>
                  <select
                    value={formConfig.transport}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, transport: e.target.value as TransportType }))}
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white outline-none focus:border-[#c5a47e]"
                  >
                    <option value="ws">WebSocket (WS - پیشنهادی)</option>
                    <option value="grpc">gRPC</option>
                    <option value="tcp">TCP</option>
                    <option value="httpupgrade">HTTPUpgrade</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'امنیت (Security / TLS)' : 'Security'}
                  </label>
                  <select
                    value={formConfig.security}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, security: e.target.value as SecurityType }))}
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white outline-none focus:border-[#c5a47e]"
                  >
                    <option value="tls">TLS (پیشنهادی ریلوی)</option>
                    <option value="reality">Reality (ضد فیلتر)</option>
                    <option value="none">None (بدون رمزنگاری)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'مسیر وب‌سوکت (Path)' : 'WS Path'}
                  </label>
                  <input
                    type="text"
                    value={formConfig.path || '/'}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, path: e.target.value }))}
                    placeholder="/vless-railway"
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                </div>
              </div>

              {/* SNI & Host */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'دامنه SNI (Server Name Indication)' : 'SNI Domain'}
                  </label>
                  <input
                    type="text"
                    value={formConfig.sni || ''}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, sni: e.target.value }))}
                    placeholder="my-app.up.railway.app"
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1.5">
                    {lang === 'fa' ? 'هدر هاست (Host Header)' : 'Host Header'}
                  </label>
                  <input
                    type="text"
                    value={formConfig.host || ''}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="my-app.up.railway.app"
                    className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                  />
                </div>
              </div>

              {/* Live URI Preview */}
              <div className="rounded-xl border border-[#c5a47e]/20 bg-[#0a0a0a] p-3">
                <span className="text-[11px] font-medium text-[#c5a47e] block mb-1">
                  {lang === 'fa' ? 'پیش‌نمایش زنده لینک کانفیگ:' : 'Live URI Preview:'}
                </span>
                <p className="font-mono text-xs text-gray-300 truncate select-all">
                  {generateConfigUri({
                    ...formConfig,
                    id: 'preview',
                    name: formConfig.name || 'Node',
                    protocol: formConfig.protocol || 'vless',
                    server: formConfig.server || 'example.com',
                    port: formConfig.port || 443,
                    transport: formConfig.transport || 'ws',
                    security: formConfig.security || 'tls',
                    remark: formConfig.name || 'Node',
                    active: true,
                    createdAt: new Date().toISOString()
                  } as ProxyConfig)}
                </p>
              </div>

              {/* Modal Actions */}
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
                  {lang === 'fa' ? 'ذخیره کانفیگ' : 'Save Config'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
