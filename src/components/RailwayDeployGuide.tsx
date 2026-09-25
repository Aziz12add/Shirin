import React, { useState } from 'react';
import { 
  Radio, 
  Copy, 
  Check, 
  Download, 
  ExternalLink, 
  Code, 
  Terminal, 
  Sparkles, 
  Server, 
  Globe,
  Zap,
  Cpu,
  Layers,
  CheckCircle2,
  FileCode,
  Box
} from 'lucide-react';
import { 
  generateRailwayDockerfile, 
  generateRailwayXrayConfig, 
  generateRailwayJsonConfig,
  generateWasmerToml,
  generateWasmerAppYaml,
  generateWasmerDockerfile,
  generateWasmerCliCommands
} from '../utils/configParsers';

interface RailwayDeployGuideProps {
  lang: 'fa' | 'en';
}

export const RailwayDeployGuide: React.FC<RailwayDeployGuideProps> = ({ lang }) => {
  // Platform selection: Wasmer (primary) or Railway
  const [platform, setPlatform] = useState<'wasmer' | 'railway'>('wasmer');

  // Wasmer file tabs
  const [wasmerTab, setWasmerTab] = useState<'wasmerToml' | 'appYaml' | 'dockerfile' | 'commands'>('wasmerToml');
  // Railway file tabs
  const [railwayTab, setRailwayTab] = useState<'dockerfile' | 'xray' | 'railwayJson' | 'env'>('dockerfile');

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const sampleUuid = 'e7b1a23c-4d5e-6f7a-8b9c-0d1e2f3a4b5c';
  const sampleTrojanPass = 'WasmerPass_2026_SecureKey';

  // Wasmer Codes
  const wasmerTomlCode = generateWasmerToml('raypanel-app');
  const wasmerAppYamlCode = generateWasmerAppYaml('raypanel-app');
  const wasmerDockerfileCode = generateWasmerDockerfile();
  const wasmerCliCommandsCode = generateWasmerCliCommands();

  // Railway Codes
  const railwayDockerfileCode = generateRailwayDockerfile();
  const xrayConfigCode = generateRailwayXrayConfig({
    uuid: sampleUuid,
    trojanPassword: sampleTrojanPass,
    vlessWsPath: '/vless-wasmer',
    trojanWsPath: '/trojan-wasmer',
    port: 8080
  });
  const railwayJsonCode = generateRailwayJsonConfig();
  const envVarsText = `PORT=8080
UUID=${sampleUuid}
TROJAN_PASSWORD=${sampleTrojanPass}
WS_PATH=/vless-wasmer`;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Platform Switcher Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl border border-[#222] bg-[#111] max-w-md">
        <button
          onClick={() => setPlatform('wasmer')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
            platform === 'wasmer'
              ? 'bg-[#c5a47e] text-black shadow-md shadow-[#c5a47e]/20'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Zap className="h-4 w-4" />
          <span>{lang === 'fa' ? 'دیپلوی Wasmer.io (پیشنهادی)' : 'Wasmer.io Deploy (Recommended)'}</span>
        </button>

        <button
          onClick={() => setPlatform('railway')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
            platform === 'railway'
              ? 'bg-[#c5a47e] text-black shadow-md shadow-[#c5a47e]/20'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Radio className="h-4 w-4" />
          <span>{lang === 'fa' ? 'دیپلوی Railway' : 'Railway Deploy'}</span>
        </button>
      </div>

      {/* WASMER SECTION */}
      {platform === 'wasmer' && (
        <>
          {/* Header Banner */}
          <div className="rounded-xl border border-[#262626] bg-[#131313] p-6 shadow-xl shadow-black">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded bg-[#c5a47e]/10 px-3 py-1 text-xs font-medium text-[#c5a47e] border border-[#c5a47e]/20">
                  <Zap className="h-3.5 w-3.5" />
                  <span>{lang === 'fa' ? 'دیپلوی روی پلتفرم Wasmer Edge / wasmer.io' : 'Deploy on Wasmer Edge'}</span>
                </div>
                <h2 className="text-2xl font-serif font-light text-white">
                  {lang === 'fa' ? 'دیپلوی فوق سریع و ابری RayPanel روی Wasmer.io' : 'Ultra-Fast RayPanel Deployment on Wasmer.io'}
                </h2>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {lang === 'fa'
                    ? 'پروژه برای دیپلوی در Wasmer به طور کامل تنظیم شده است. با فایل‌های wasmer.toml و app.yaml یا از طریق داکر، می‌توانید تنها با یک دستور wasmer deploy یا اتصال گیت‌هاب در داشبورد Wasmer پروژه را آنلاین کنید.'
                    : 'The project is now fully configured for Wasmer.io. Deploy using wasmer.toml and app.yaml via the CLI or connect your GitHub repository in the Wasmer dashboard.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <a
                  href="https://wasmer.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-[#c5a47e] px-4 py-2.5 text-xs font-semibold text-black shadow-lg shadow-[#c5a47e]/20 hover:bg-[#b3936d] transition-all"
                >
                  <Globe className="h-4 w-4" />
                  <span>{lang === 'fa' ? 'ورود به Wasmer.io' : 'Open Wasmer.io'}</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* 4 Steps to Deploy on Wasmer */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] font-serif font-bold text-sm border border-[#c5a47e]/20">
                1
              </div>
              <h4 className="text-xs font-medium text-white">
                {lang === 'fa' ? 'نصب Wasmer CLI' : 'Install Wasmer CLI'}
              </h4>
              <p className="text-[11px] text-gray-500 leading-normal">
                {lang === 'fa' 
                  ? 'دستور curl https://get.wasmer.io -sSfL | sh را در ترمینال بزنید.' 
                  : 'Run curl https://get.wasmer.io -sSfL | sh in terminal.'}
              </p>
            </div>

            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] font-serif font-bold text-sm border border-[#c5a47e]/20">
                2
              </div>
              <h4 className="text-xs font-medium text-white">
                {lang === 'fa' ? 'لاگین در Wasmer' : 'Login to Wasmer'}
              </h4>
              <p className="text-[11px] text-gray-500 leading-normal">
                {lang === 'fa' 
                  ? 'دستور wasmer login را اجرا کنید تا به اکانت خود وصل شوید.' 
                  : 'Run wasmer login to authenticate with your account.'}
              </p>
            </div>

            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] font-serif font-bold text-sm border border-[#c5a47e]/20">
                3
              </div>
              <h4 className="text-xs font-medium text-white">
                {lang === 'fa' ? 'اجرای دیپلوی' : 'Deploy Command'}
              </h4>
              <p className="text-[11px] text-gray-500 leading-normal">
                {lang === 'fa' 
                  ? 'دستور wasmer deploy را بزنید یا ریپوی گیت‌هاب را در پنل Wasmer انتخاب کنید.' 
                  : 'Run wasmer deploy or import your repo in Wasmer.io.'}
              </p>
            </div>

            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] font-serif font-bold text-sm border border-[#c5a47e]/20">
                4
              </div>
              <h4 className="text-xs font-medium text-white">
                {lang === 'fa' ? 'دریافت دامنه و ساب مهسا' : 'Get Wasmer Domain'}
              </h4>
              <p className="text-[11px] text-gray-500 leading-normal">
                {lang === 'fa' 
                  ? 'آدرس دامنه (مثلاً your-app.wasmer.app) را در تب کانفیگ‌ها وارد و ساب را بردارید.' 
                  : 'Add your-app.wasmer.app to RayPanel configs and get sub.'}
              </p>
            </div>

          </div>

          {/* Wasmer Code Viewer */}
          <div className="rounded-xl border border-[#222222] bg-[#131313] overflow-hidden shadow-xl shadow-black">
            
            {/* Tab Headers */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222222] bg-[#0d0d0d] px-6 py-3">
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  onClick={() => setWasmerTab('wasmerToml')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    wasmerTab === 'wasmerToml'
                      ? 'bg-[#c5a47e] text-black font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <FileCode className="h-3.5 w-3.5" />
                  <span>wasmer.toml</span>
                </button>

                <button
                  onClick={() => setWasmerTab('appYaml')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    wasmerTab === 'appYaml'
                      ? 'bg-[#c5a47e] text-black font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>app.yaml</span>
                </button>

                <button
                  onClick={() => setWasmerTab('dockerfile')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    wasmerTab === 'dockerfile'
                      ? 'bg-[#c5a47e] text-black font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Box className="h-3.5 w-3.5" />
                  <span>Dockerfile</span>
                </button>

                <button
                  onClick={() => setWasmerTab('commands')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    wasmerTab === 'commands'
                      ? 'bg-[#c5a47e] text-black font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>{lang === 'fa' ? 'دستورات ترمینال' : 'CLI Commands'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {wasmerTab === 'wasmerToml' && (
                  <>
                    <button
                      onClick={() => handleCopy(wasmerTomlCode, 'wasmerToml')}
                      className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#181818] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-[#242424]"
                    >
                      {copiedKey === 'wasmerToml' ? <Check className="h-3 w-3 text-[#c5a47e]" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedKey === 'wasmerToml' ? 'کپی شد' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => handleDownloadFile('wasmer.toml', wasmerTomlCode)}
                      className="flex items-center gap-1 rounded-lg bg-[#c5a47e] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#b3936d]"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </button>
                  </>
                )}

                {wasmerTab === 'appYaml' && (
                  <>
                    <button
                      onClick={() => handleCopy(wasmerAppYamlCode, 'appYaml')}
                      className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#181818] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-[#242424]"
                    >
                      {copiedKey === 'appYaml' ? <Check className="h-3 w-3 text-[#c5a47e]" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedKey === 'appYaml' ? 'کپی شد' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => handleDownloadFile('app.yaml', wasmerAppYamlCode)}
                      className="flex items-center gap-1 rounded-lg bg-[#c5a47e] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#b3936d]"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </button>
                  </>
                )}

                {wasmerTab === 'dockerfile' && (
                  <>
                    <button
                      onClick={() => handleCopy(wasmerDockerfileCode, 'dockerfile')}
                      className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#181818] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-[#242424]"
                    >
                      {copiedKey === 'dockerfile' ? <Check className="h-3 w-3 text-[#c5a47e]" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedKey === 'dockerfile' ? 'کپی شد' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => handleDownloadFile('Dockerfile', wasmerDockerfileCode)}
                      className="flex items-center gap-1 rounded-lg bg-[#c5a47e] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#b3936d]"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </button>
                  </>
                )}

                {wasmerTab === 'commands' && (
                  <button
                    onClick={() => handleCopy(wasmerCliCommandsCode, 'commands')}
                    className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#181818] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-[#242424]"
                  >
                    {copiedKey === 'commands' ? <Check className="h-3 w-3 text-[#c5a47e]" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedKey === 'commands' ? 'کپی شد' : 'Copy'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Code Box Content */}
            <div className="p-6 bg-[#0a0a0a] font-mono text-xs text-gray-300 overflow-x-auto border-t border-[#1a1a1a]">
              {wasmerTab === 'wasmerToml' && (
                <pre className="whitespace-pre">{wasmerTomlCode}</pre>
              )}

              {wasmerTab === 'appYaml' && (
                <pre className="whitespace-pre">{wasmerAppYamlCode}</pre>
              )}

              {wasmerTab === 'dockerfile' && (
                <pre className="whitespace-pre">{wasmerDockerfileCode}</pre>
              )}

              {wasmerTab === 'commands' && (
                <pre className="whitespace-pre">{wasmerCliCommandsCode}</pre>
              )}
            </div>

          </div>
        </>
      )}

      {/* RAILWAY SECTION */}
      {platform === 'railway' && (
        <>
          {/* Header Banner */}
          <div className="rounded-xl border border-[#262626] bg-[#131313] p-6 shadow-xl shadow-black">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded bg-[#c5a47e]/10 px-3 py-1 text-xs font-medium text-[#c5a47e] border border-[#c5a47e]/20">
                  <Radio className="h-3.5 w-3.5" />
                  <span>{lang === 'fa' ? 'راهنمای راه‌اندازی و دیپلوی در Railway' : 'Railway Cloud Deployment Guide'}</span>
                </div>
                <h2 className="text-2xl font-serif font-light text-white">
                  {lang === 'fa' ? 'دیپلوی اختصاصی سرور Xray / VLESS / Trojan روی Railway' : 'Deploy Private Xray Core on Railway'}
                </h2>
                <p className="text-xs text-gray-500">
                  {lang === 'fa'
                    ? 'فایل‌های زیر را در یک ریپازیتوری گیت‌هاب قرار دهید و با ۱ کلیک در Railway دیپلوی کنید تا سرور شخصی شما آماده شود.'
                    : 'Deploy the configuration files to Railway.app using Docker for a blazing fast private proxy.'}
                </p>
              </div>

              <a
                href="https://railway.app/new"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-[#c5a47e] px-5 py-2.5 text-xs font-semibold text-black shadow-lg shadow-[#c5a47e]/20 hover:bg-[#b3936d] transition-all"
              >
                <span>{lang === 'fa' ? 'ورود به داشبورد Railway' : 'Open Railway.app'}</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Step by step cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] font-serif font-bold text-sm border border-[#c5a47e]/20">
                1
              </div>
              <h4 className="text-xs font-medium text-white">
                {lang === 'fa' ? 'دانلود فایل‌ها' : 'Get Files'}
              </h4>
              <p className="text-[11px] text-gray-500">
                {lang === 'fa' ? 'فایل Dockerfile و config.json را از کادر زیر دانلود کنید.' : 'Download Dockerfile and config.json from below.'}
              </p>
            </div>

            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] font-serif font-bold text-sm border border-[#c5a47e]/20">
                2
              </div>
              <h4 className="text-xs font-medium text-white">
                {lang === 'fa' ? 'ساخت سرویس در Railway' : 'Create Railway Service'}
              </h4>
              <p className="text-[11px] text-gray-500">
                {lang === 'fa' ? 'در Railway یک پروژه جدید بسازید و ریپوی گیت‌هاب را وصل کنید.' : 'Create a new project on Railway from GitHub.'}
              </p>
            </div>

            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] font-serif font-bold text-sm border border-[#c5a47e]/20">
                3
              </div>
              <h4 className="text-xs font-medium text-white">
                {lang === 'fa' ? 'تولید دامنه اختصاصی' : 'Generate Domain'}
              </h4>
              <p className="text-[11px] text-gray-500">
                {lang === 'fa' ? 'در تب Settings سرویس ریلوی، دکمه Generate Domain را بزنید.' : 'In Railway Settings, click Generate Domain.'}
              </p>
            </div>

            <div className="rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-4 space-y-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c5a47e]/10 text-[#c5a47e] font-serif font-bold text-sm border border-[#c5a47e]/20">
                4
              </div>
              <h4 className="text-xs font-medium text-white">
                {lang === 'fa' ? 'افزودن به RayPanel' : 'Connect to RayPanel'}
              </h4>
              <p className="text-[11px] text-gray-500">
                {lang === 'fa' ? 'دامنه ریلوی را در تب کانفیگ‌ها وارد کنید و ساب مهسا آن‌جی بگیرید.' : 'Add your domain into RayPanel and get MahsaNG sub.'}
              </p>
            </div>

          </div>

          {/* Railway Code Viewer Box */}
          <div className="rounded-xl border border-[#222222] bg-[#131313] overflow-hidden shadow-xl shadow-black">
            
            {/* Tab Headers */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222222] bg-[#0d0d0d] px-6 py-3">
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  onClick={() => setRailwayTab('dockerfile')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    railwayTab === 'dockerfile'
                      ? 'bg-[#c5a47e] text-black font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Code className="h-3.5 w-3.5" />
                  <span>Dockerfile</span>
                </button>

                <button
                  onClick={() => setRailwayTab('xray')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    railwayTab === 'xray'
                      ? 'bg-[#c5a47e] text-black font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Server className="h-3.5 w-3.5" />
                  <span>config.json (Xray Server)</span>
                </button>

                <button
                  onClick={() => setRailwayTab('railwayJson')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    railwayTab === 'railwayJson'
                      ? 'bg-[#c5a47e] text-black font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>railway.json</span>
                </button>

                <button
                  onClick={() => setRailwayTab('env')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    railwayTab === 'env'
                      ? 'bg-[#c5a47e] text-black font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Variables (.env)</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {railwayTab === 'dockerfile' && (
                  <>
                    <button
                      onClick={() => handleCopy(railwayDockerfileCode, 'dockerfile')}
                      className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#181818] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-[#242424]"
                    >
                      {copiedKey === 'dockerfile' ? <Check className="h-3 w-3 text-[#c5a47e]" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedKey === 'dockerfile' ? 'کپی شد' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => handleDownloadFile('Dockerfile', railwayDockerfileCode)}
                      className="flex items-center gap-1 rounded-lg bg-[#c5a47e] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#b3936d]"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </button>
                  </>
                )}

                {railwayTab === 'xray' && (
                  <>
                    <button
                      onClick={() => handleCopy(xrayConfigCode, 'xray')}
                      className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#181818] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-[#242424]"
                    >
                      {copiedKey === 'xray' ? <Check className="h-3 w-3 text-[#c5a47e]" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedKey === 'xray' ? 'کپی شد' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => handleDownloadFile('config.json', xrayConfigCode)}
                      className="flex items-center gap-1 rounded-lg bg-[#c5a47e] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#b3936d]"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </button>
                  </>
                )}

                {railwayTab === 'railwayJson' && (
                  <button
                    onClick={() => handleCopy(railwayJsonCode, 'railwayJson')}
                    className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#181818] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-[#242424]"
                  >
                    {copiedKey === 'railwayJson' ? <Check className="h-3 w-3 text-[#c5a47e]" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedKey === 'railwayJson' ? 'کپی شد' : 'Copy'}</span>
                  </button>
                )}

                {railwayTab === 'env' && (
                  <button
                    onClick={() => handleCopy(envVarsText, 'env')}
                    className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#181818] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-[#242424]"
                  >
                    {copiedKey === 'env' ? <Check className="h-3 w-3 text-[#c5a47e]" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedKey === 'env' ? 'کپی شد' : 'Copy'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Code Box Content */}
            <div className="p-6 bg-[#0a0a0a] font-mono text-xs text-gray-300 overflow-x-auto border-t border-[#1a1a1a]">
              {railwayTab === 'dockerfile' && (
                <pre className="whitespace-pre">{railwayDockerfileCode}</pre>
              )}

              {railwayTab === 'xray' && (
                <pre className="whitespace-pre">{xrayConfigCode}</pre>
              )}

              {railwayTab === 'railwayJson' && (
                <pre className="whitespace-pre">{railwayJsonCode}</pre>
              )}

              {railwayTab === 'env' && (
                <pre className="whitespace-pre">{envVarsText}</pre>
              )}
            </div>

          </div>
        </>
      )}

    </div>
  );
};
