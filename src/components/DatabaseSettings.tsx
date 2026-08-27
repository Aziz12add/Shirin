import React, { useState } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  CheckCircle, 
  RotateCcw, 
  Server, 
  HardDrive, 
  ShieldCheck, 
  FileJson,
  Sparkles,
  Link2,
  Save,
  Check
} from 'lucide-react';
import { DatabaseSettings as IDatabaseSettings } from '../types';

interface DatabaseSettingsProps {
  settings: IDatabaseSettings;
  onSaveSettings: (settings: Partial<IDatabaseSettings>) => void;
  onExportDatabase: () => void;
  onImportDatabase: (jsonData: any) => void;
  lang: 'fa' | 'en';
}

export const DatabaseSettings: React.FC<DatabaseSettingsProps> = ({
  settings,
  onSaveSettings,
  onExportDatabase,
  onImportDatabase,
  lang,
}) => {
  const [dbType, setDbType] = useState<IDatabaseSettings['type']>(settings?.type || 'local_json');
  const [connStr, setConnStr] = useState<string>(settings?.connectionString || '');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      type: dbType,
      connectionString: connStr,
      status: 'connected',
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        onImportDatabase(json);
        setImportStatus(lang === 'fa' ? 'اطلاعات دیتابیس با موفقیت بازیابی شد!' : 'Database restored successfully!');
        setTimeout(() => setImportStatus(null), 3000);
      } catch (err) {
        setImportStatus(lang === 'fa' ? 'خطا در خواندن فایل JSON.' : 'Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-serif font-light text-white flex items-center gap-2.5">
          <Database className="h-5 w-5 text-[#c5a47e]" />
          <span>{lang === 'fa' ? 'مدیریت و اتصال به دیتابیس' : 'Database & Data Persistence'}</span>
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {lang === 'fa' 
            ? 'ذخیره دائمی اطلاعات کانفیگ‌ها و کاربران، اتصال به دیتابیس ابری، و خروجی بکاپ JSON' 
            : 'Configure local and cloud database persistence, export and restore backups'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Database Connection Settings */}
        <div className="rounded-xl border border-[#222222] bg-[#131313] p-6 space-y-5 shadow-xl shadow-black">
          <div className="flex items-center justify-between border-b border-[#222222] pb-4">
            <h3 className="font-serif text-lg text-white font-medium flex items-center gap-2">
              <Server className="h-4 w-4 text-[#c5a47e]" />
              <span>{lang === 'fa' ? 'تنظیمات اتصال دیتابیس' : 'Database Provider'}</span>
            </h3>
            <span className="flex items-center gap-1.5 rounded bg-[#c5a47e]/10 px-2.5 py-1 text-xs font-medium text-[#c5a47e] border border-[#c5a47e]/30">
              <CheckCircle className="h-3 w-3" />
              <span>{lang === 'fa' ? 'متصل و فعال' : 'Connected'}</span>
            </span>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">
                {lang === 'fa' ? 'نوع پایگاه داده (Storage Engine)' : 'Storage Type'}
              </label>
              <select
                value={dbType}
                onChange={(e) => setDbType(e.target.value as any)}
                className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2.5 text-xs text-white font-medium outline-none focus:border-[#c5a47e]"
              >
                <option value="local_json">{lang === 'fa' ? 'فایل محلی JSON (پرسرعت و ذخیره در data/db.json)' : 'Local JSON File (data/db.json)'}</option>
                <option value="postgres">{lang === 'fa' ? 'پایگاه داده PostgreSQL / Supabase / Neon' : 'PostgreSQL / Supabase / Neon'}</option>
                <option value="firebase">{lang === 'fa' ? 'پایگاه داده Firebase Firestore' : 'Firebase Firestore'}</option>
                <option value="mongodb">{lang === 'fa' ? 'پایگاه داده MongoDB Atlas' : 'MongoDB Atlas'}</option>
              </select>
            </div>

            {dbType !== 'local_json' && (
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1.5">
                  {lang === 'fa' ? 'رشته اتصال (Connection String / URI)' : 'Connection String'}
                </label>
                <input
                  type="password"
                  value={connStr}
                  onChange={(e) => setConnStr(e.target.value)}
                  placeholder="postgresql://user:pass@ep-cool-db.us-east-2.aws.neon.tech/main"
                  className="w-full rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2.5 text-xs text-white font-mono outline-none focus:border-[#c5a47e]"
                />
              </div>
            )}

            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-3 text-xs text-gray-400 space-y-1">
              <div className="flex items-center gap-2 text-gray-300 font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-[#c5a47e]" />
                <span>{lang === 'fa' ? 'همگام‌سازی خودکار دیتابیس فعال است' : 'Auto-save Enabled'}</span>
              </div>
              <p className="text-[11px] text-gray-500">
                {lang === 'fa' 
                  ? 'تمامی تغییرات، ایجاد کانفیگ و ثبت ترافیک کاربران به صورت فوری و مطمئن در دیسک ذخیره می‌شود.'
                  : 'All configs, users, and traffic changes are automatically persisted to disk.'}
              </p>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#c5a47e] py-2.5 text-xs font-semibold text-black hover:bg-[#b3936d] transition-colors shadow-lg shadow-[#c5a47e]/20"
            >
              {savedSuccess ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              <span>{savedSuccess ? (lang === 'fa' ? 'تنظیمات ذخیره شد' : 'Saved!') : (lang === 'fa' ? 'ذخیره تنظیمات دیتابیس' : 'Save Settings')}</span>
            </button>
          </form>
        </div>

        {/* Backup & Restore Panel */}
        <div className="rounded-xl border border-[#222222] bg-[#131313] p-6 space-y-5 shadow-xl shadow-black">
          <div className="border-b border-[#222222] pb-4">
            <h3 className="font-serif text-lg text-white font-medium flex items-center gap-2">
              <FileJson className="h-4 w-4 text-[#c5a47e]" />
              <span>{lang === 'fa' ? 'پشتیبان‌گیری و بازیابی (Backup & Restore)' : 'Backup & Restore'}</span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {lang === 'fa' ? 'دانلود فایل کامل دیتابیس یا بازیابی بکاپ قبلی' : 'Download JSON snapshot or restore previous state'}
            </p>
          </div>

          <div className="space-y-4">
            
            {/* Export */}
            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-medium text-white">
                  {lang === 'fa' ? 'دریافت نسخه پشتیبان (JSON Export)' : 'Export Full Backup'}
                </h4>
                <p className="text-[11px] text-gray-500">
                  {lang === 'fa' ? 'شامل تمامی کانفیگ‌ها، کاربران، رمزها و آمار مصرف' : 'Includes all nodes, users, tokens & bandwidth data'}
                </p>
              </div>

              <button
                onClick={onExportDatabase}
                className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#181818] px-4 py-2 text-xs font-medium text-gray-200 hover:border-[#c5a47e]/40 hover:text-[#c5a47e] transition-colors shrink-0"
              >
                <Download className="h-3.5 w-3.5 text-[#c5a47e]" />
                <span>{lang === 'fa' ? 'دانلود بکاپ' : 'Download'}</span>
              </button>
            </div>

            {/* Import */}
            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-3">
              <div>
                <h4 className="text-xs font-medium text-white">
                  {lang === 'fa' ? 'بازیابی نسخه پشتیبان (JSON Import)' : 'Restore Backup'}
                </h4>
                <p className="text-[11px] text-gray-500">
                  {lang === 'fa' ? 'فایل بکاپ raypanel-backup.json را انتخاب کنید' : 'Upload your backup JSON file'}
                </p>
              </div>

              <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#2d2d2d] bg-[#0e0e0e] p-4 text-xs font-medium text-gray-400 hover:border-[#c5a47e]/50 hover:text-white cursor-pointer transition-colors">
                <Upload className="h-4 w-4 text-[#c5a47e]" />
                <span>{lang === 'fa' ? 'انتخاب و آپلود فایل بکاپ' : 'Choose Backup JSON File'}</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {importStatus && (
                <div className="rounded-lg bg-[#c5a47e]/10 border border-[#c5a47e]/30 p-2.5 text-xs text-[#c5a47e] text-center font-medium">
                  {importStatus}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
