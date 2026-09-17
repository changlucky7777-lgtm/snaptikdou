import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download, History, ExternalLink, Sun, Moon } from 'lucide-react';
import { DiamondLogo } from './DiamondLogo';
import { LanguageSelector } from './LanguageSelector';

interface HeaderProps {
  activeTab: 'download' | 'history';
  setActiveTab: (tab: 'download' | 'history') => void;
  historyCount: number;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  historyCount,
  theme = 'dark',
  onToggleTheme,
}) => {
  const { t } = useTranslation();

  return (
    <header className={`w-full sticky top-0 z-40 backdrop-blur-md border-b shadow-xl transition-colors duration-200 ${
      theme === 'light'
        ? 'bg-white/95 border-slate-200 text-slate-800'
        : 'bg-slate-900/90 border-slate-800/80 text-white'
    }`}>
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3">
        {/* Cụm Logo bên trái */}
        <div
          id="brand-logo"
          onClick={() => setActiveTab('download')}
          className="flex items-center gap-2 shrink-0 cursor-pointer select-none group"
        >
          <div className="relative w-8 h-8 sm:w-9 sm:h-9 transition-transform duration-300 group-hover:scale-105 flex items-center justify-center">
            <DiamondLogo size={36} className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className={`text-base sm:text-lg font-bold tracking-tight inline-block ${
                theme === 'light' ? 'text-slate-900' : 'text-white'
              }`}>
                SnapTikDou
              </span>
            </div>
            <p className={`text-[11px] hidden md:block ${
              theme === 'light' ? 'text-slate-500' : 'text-slate-400'
            }`}>
              {t('sloganSub')}
            </p>
          </div>
        </div>

        {/* Cụm các nút chức năng bên phải */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Nút Tải Video */}
          <button
            id="nav-tab-download"
            type="button"
            onClick={() => setActiveTab('download')}
            className={`p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'download'
                ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                : theme === 'light'
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
            }`}
            title={t('tabDownload')}
          >
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">{t('tabDownload')}</span>
          </button>

          {/* Nút Lịch Sử */}
          <button
            id="nav-tab-history"
            type="button"
            onClick={() => setActiveTab('history')}
            className={`p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition flex items-center gap-1.5 relative cursor-pointer ${
              activeTab === 'history'
                ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                : theme === 'light'
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
            }`}
            title={t('tabHistory')}
          >
            <History className="w-4 h-4" />
            <span className="hidden md:inline">{t('tabHistory')}</span>
            {historyCount > 0 && (
              <span className="bg-pink-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {historyCount}
              </span>
            )}
          </button>

          {/* Nút đổi ngôn ngữ */}
          <LanguageSelector />

          {/* Dark / Light Theme Toggle Button */}
          {onToggleTheme && (
            <button
              id="btn-toggle-theme"
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 flex items-center justify-center cursor-pointer select-none active:scale-95 border ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-amber-500 shadow-sm'
                  : 'bg-slate-800/90 hover:bg-slate-700/90 border-slate-700 text-amber-400 shadow-inner'
              }`}
              aria-label="Chuyển đổi giao diện sáng tối"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 transition-transform duration-300 hover:rotate-45" />
              ) : (
                <Moon className="w-4 h-4 transition-transform duration-300 -rotate-12 text-slate-700 hover:text-slate-900" />
              )}
            </button>
          )}

          {typeof window !== 'undefined' && window.self !== window.top && (
            <a
              id="btn-open-tab"
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              title="Mở toàn màn hình trong tab mới để tải nhanh không giới hạn"
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                theme === 'light'
                  ? 'text-cyan-700 bg-cyan-50 border border-cyan-200 hover:bg-cyan-100'
                  : 'text-cyan-300 bg-cyan-950/70 border border-cyan-800/60 hover:bg-cyan-900/70'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-500" />
              <span className="hidden sm:inline">{t('btnOpenNewTab')}</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
};
