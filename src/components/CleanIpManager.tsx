import React, { useState } from 'react';
import { 
  Globe, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  Copy, 
  Zap, 
  Activity, 
  Wifi, 
  Radio, 
  ShieldCheck, 
  Search, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { CleanIpEntry } from '../types';

interface CleanIpManagerProps {
  cleanIps: CleanIpEntry[];
  onSaveIp: (ip: CleanIpEntry) => Promise<void>;
  onDeleteIp: (id: string) => Promise<void>;
  onTestPing: (id: string) => Promise<number | null>;
  lang: 'fa' | 'en';
}

export const CleanIpManager: React.FC<CleanIpManagerProps> = ({
  cleanIps,
  onSaveIp,
  onDeleteIp,
  onTestPing,
  lang,
}) => {
  const [filterOperator, setFilterOperator] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingIp, setEditingIp] = useState<CleanIpEntry | null>(null);

  const [formIp, setFormIp] = useState<Partial<CleanIpEntry>>({
    ip: '',
    operator: 'mci',
    name: '',
    ispNameFa: '',
    notes: '',
    active: true,
  });

  const operatorPresets = [
    { id: 'all', labelFa: 'همه اپراتورها', labelEn: 'All Operators' },
    { id: 'mci', labelFa: 'همراه اول (MCI)', labelEn: 'MCI', color: 'text-sky-400 bg-sky-950/40 border-sky-800/40' },
    { id: 'irancell', labelFa: 'ایرانسل (MTN)', labelEn: 'Irancell', color: 'text-amber-400 bg-amber-950/40 border-amber-800/40' },
    { id: 'rightel', labelFa: 'رایتل (Rightel)', labelEn: 'Rightel', color: 'text-purple-400 bg-purple-950/40 border-purple-800/40' },
    { id: 'fixed', labelFa: 'اینترنت ثابت / ADSL', labelEn: 'Fixed / ADSL', color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40' },
  ];

  const handleCopyIp = (ip: string, id: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenAdd = () => {
    setEditingIp(null);
    setFormIp({
      ip: '',
      operator: 'mci',
      name: '',
      ispNameFa: 'همراه اول',
      notes: '',
      active: true,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (entry: CleanIpEntry) => {
    setEditingIp(entry);
    setFormIp(entry);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formIp.ip) return;

    const entryToSave: CleanIpEntry = {
      id: editingIp ? editingIp.id : `cip-${Date.now()}`,
      ip: formIp.ip.trim(),
      operator: (formIp.operator as any) || 'mci',
      name: formIp.name || `IP-${formIp.ip}`,
      ispNameFa: formIp.ispNameFa || 'سراسری',
      pingMs: formIp.pingMs,
      active: formIp.active ?? true,
      addedAt: editingIp ? editingIp.addedAt : new Date().toISOString(),
      notes: formIp.notes || '',
    };

    await onSaveIp(entryToSave);
    setShowModal(false);
  };

  const handleRunPing = async (id: string) => {
    setTestingId(id);
    await onTestPing(id);
    setTestingId(null);
  };

  // Filtered IPs
  const filteredList = cleanIps.filter(item => {
    const matchOp = filterOperator === 'all' || item.operator === filterOperator;
    const matchSearch = item.ip.includes(searchQuery) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.ispNameFa.toLowerCase().includes(searchQuery.toLowerCase());
    return matchOp && matchSearch;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Quick Add */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-[#222] bg-[#121212] p-5 shadow-xl shadow-black">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#c5a47e]/10 px-3 py-1 text-xs font-medium text-[#c5a47e] border border-[#c5a47e]/20">
            <Globe className="h-3.5 w-3.5" />
            <span>{lang === 'fa' ? 'مدیریت و پایش Clean IP اختصاصی' : 'Clean IP Pool Manager'}</span>
          </div>
          <h2 className="text-xl font-serif text-white">
            {lang === 'fa' ? 'آی‌پی‌های تمیز ضد فیلتر برای اپراتورهای ایران' : 'Clean IPs for Iranian ISPs'}
          </h2>
          <p className="text-xs text-gray-400">
            {lang === 'fa'
              ? 'با قرار دادن این IPها به عنوان آدرس اتصال کانفیگ، ترافیک از دامنه‌های مسدود نشده عبور کرده و فیلترینگ دور زده می‌شود.'
              : 'Direct proxy traffic through clean Cloudflare / CDN nodes to bypass SNI throttling.'}
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 rounded-lg bg-[#c5a47e] px-4 py-2.5 text-xs font-semibold text-black shadow-md shadow-[#c5a47e]/20 hover:bg-[#b3936d] transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>{lang === 'fa' ? 'افزودن Clean IP جدید' : 'Add Clean IP'}</span>
        </button>
      </div>

      {/* Operator Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {operatorPresets.map(preset => (
            <button
              key={preset.id}
              onClick={() => setFilterOperator(preset.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all shrink-0 ${
                filterOperator === preset.id
                  ? 'bg-[#c5a47e] text-black font-semibold shadow-sm'
                  : 'bg-[#181818] text-gray-400 hover:text-white border border-[#252525]'
              }`}
            >
              {lang === 'fa' ? preset.labelFa : preset.labelEn}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={lang === 'fa' ? 'جستجوی IP یا نام اپراتور...' : 'Search IP or ISP...'}
            className="w-full rounded-lg border border-[#252525] bg-[#141414] py-1.5 pl-3 pr-9 text-xs text-white placeholder-gray-500 focus:border-[#c5a47e] focus:outline-none"
          />
        </div>
      </div>

      {/* Clean IP Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredList.map(item => {
          const isTesting = testingId === item.id;
          const isCopied = copiedId === item.id;

          let badgeColor = 'bg-gray-800 text-gray-300 border-gray-700';
          if (item.operator === 'mci') badgeColor = 'bg-sky-950/60 text-sky-400 border-sky-800/50';
          if (item.operator === 'irancell') badgeColor = 'bg-amber-950/60 text-amber-400 border-amber-800/50';
          if (item.operator === 'rightel') badgeColor = 'bg-purple-950/60 text-purple-400 border-purple-800/50';
          if (item.operator === 'fixed') badgeColor = 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50';

          return (
            <div
              key={item.id}
              className={`rounded-xl border p-4.5 space-y-3.5 transition-all shadow-lg ${
                item.active 
                  ? 'border-[#262626] bg-[#141414] hover:border-[#383838]' 
                  : 'border-[#1e1e1e] bg-[#0e0e0e] opacity-60'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white tracking-wide">
                      {item.ip}
                    </span>
                    <button
                      onClick={() => handleCopyIp(item.ip, item.id)}
                      className="text-gray-500 hover:text-[#c5a47e] transition-colors p-1"
                      title="Copy IP"
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 font-medium">{item.name}</p>
                </div>

                <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${badgeColor}`}>
                  {item.ispNameFa}
                </span>
              </div>

              {/* Ping & Status Row */}
              <div className="flex items-center justify-between rounded-lg bg-[#0a0a0a] p-2.5 border border-[#1f1f1f]">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-[11px] text-gray-400">{lang === 'fa' ? 'تاخیر پینگ:' : 'Latency:'}</span>
                  {item.pingMs ? (
                    <span className={`font-mono text-xs font-bold ${
                      item.pingMs < 60 ? 'text-green-400' : item.pingMs < 110 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {item.pingMs} ms
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-500">{lang === 'fa' ? 'تست نشده' : 'Untested'}</span>
                  )}
                </div>

                <button
                  onClick={() => handleRunPing(item.id)}
                  disabled={isTesting}
                  className="flex items-center gap-1 rounded bg-[#222] px-2.5 py-1 text-[11px] font-medium text-gray-300 hover:bg-[#333] hover:text-white transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isTesting ? 'animate-spin text-[#c5a47e]' : ''}`} />
                  <span>{isTesting ? (lang === 'fa' ? 'در حال تست...' : 'Testing...') : (lang === 'fa' ? 'تست پینگ' : 'Ping')}</span>
                </button>
              </div>

              {/* Notes */}
              {item.notes && (
                <p className="text-[11px] text-gray-500 line-clamp-1 italic">
                  💬 {item.notes}
                </p>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-[#1f1f1f]">
                <button
                  onClick={() => onSaveIp({ ...item, active: !item.active })}
                  className={`text-[11px] font-medium transition-colors ${
                    item.active ? 'text-emerald-400 hover:text-emerald-300' : 'text-gray-500 hover:text-gray-400'
                  }`}
                >
                  {item.active ? (lang === 'fa' ? '● فعال در کانفیگ‌ها' : '● Active') : (lang === 'fa' ? '○ غیرفعال' : '○ Inactive')}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(item)}
                    className="rounded p-1 text-gray-400 hover:bg-[#222] hover:text-white transition-colors"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteIp(item.id)}
                    className="rounded p-1 text-gray-500 hover:bg-rose-950/30 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {filteredList.length === 0 && (
        <div className="rounded-xl border border-[#222] bg-[#111] p-10 text-center space-y-3">
          <Globe className="mx-auto h-8 w-8 text-gray-600" />
          <p className="text-sm text-gray-400">
            {lang === 'fa' ? 'هیچ Clean IP ای یافت نشد.' : 'No Clean IPs found.'}
          </p>
          <button
            onClick={handleOpenAdd}
            className="rounded-lg bg-[#c5a47e] px-4 py-1.5 text-xs font-semibold text-black"
          >
            {lang === 'fa' ? 'افزودن اولین Clean IP' : 'Add First Clean IP'}
          </button>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#222] pb-3">
              <h3 className="text-base font-serif text-white">
                {editingIp 
                  ? (lang === 'fa' ? 'ویرایش Clean IP' : 'Edit Clean IP') 
                  : (lang === 'fa' ? 'افزودن Clean IP جدید' : 'Add New Clean IP')}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  {lang === 'fa' ? 'آدرس IP تمیز (IPv4)' : 'Clean IPv4 Address'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 104.16.132.229"
                  value={formIp.ip || ''}
                  onChange={e => setFormIp(prev => ({ ...prev, ip: e.target.value }))}
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] px-3 py-2 text-xs font-mono text-white placeholder-gray-600 focus:border-[#c5a47e] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    {lang === 'fa' ? 'اپراتور هدف' : 'Target Operator'}
                  </label>
                  <select
                    value={formIp.operator || 'mci'}
                    onChange={e => {
                      const op = e.target.value as any;
                      let ispName = 'همراه اول';
                      if (op === 'irancell') ispName = 'ایرانسل';
                      if (op === 'rightel') ispName = 'رایتل';
                      if (op === 'fixed') ispName = 'مخابرات / شاتل';
                      setFormIp(prev => ({ ...prev, operator: op, ispNameFa: ispName }));
                    }}
                    className="w-full rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] px-3 py-2 text-xs text-white focus:border-[#c5a47e] focus:outline-none"
                  >
                    <option value="mci">همراه اول (MCI)</option>
                    <option value="irancell">ایرانسل (Irancell)</option>
                    <option value="rightel">رایتل (Rightel)</option>
                    <option value="fixed">اینترنت ثابت / ADSL</option>
                    <option value="other">سایر / خارجی</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    {lang === 'fa' ? 'برچسب فارسی' : 'Label (Fa)'}
                  </label>
                  <input
                    type="text"
                    value={formIp.ispNameFa || ''}
                    onChange={e => setFormIp(prev => ({ ...prev, ispNameFa: e.target.value }))}
                    className="w-full rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] px-3 py-2 text-xs text-white focus:border-[#c5a47e] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  {lang === 'fa' ? 'نام یا شناسه نود' : 'Node Label / City'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cloudflare Anycast Tehran"
                  value={formIp.name || ''}
                  onChange={e => setFormIp(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-[#c5a47e] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  {lang === 'fa' ? 'توضیحات و نکات اتصال' : 'Notes'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. سرعت عالی روی همراه اول بدون پکت لاس"
                  value={formIp.notes || ''}
                  onChange={e => setFormIp(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#0c0c0c] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-[#c5a47e] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="activeCheck"
                  checked={formIp.active ?? true}
                  onChange={e => setFormIp(prev => ({ ...prev, active: e.target.checked }))}
                  className="rounded border-[#333] text-[#c5a47e] focus:ring-[#c5a47e]"
                />
                <label htmlFor="activeCheck" className="text-xs text-gray-300 cursor-pointer">
                  {lang === 'fa' ? 'فعال و در دسترس برای کانفیگ‌ها' : 'Active and available for configs'}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#222]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-[#333] px-4 py-2 text-xs font-medium text-gray-400 hover:text-white"
                >
                  {lang === 'fa' ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#c5a47e] px-5 py-2 text-xs font-semibold text-black hover:bg-[#b3936d]"
                >
                  {lang === 'fa' ? 'ذخیره Clean IP' : 'Save Clean IP'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
