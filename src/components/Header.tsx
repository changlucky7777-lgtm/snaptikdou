import React from 'react';
import { Download, History, ExternalLink, Sun, Moon } from 'lucide-react';
import { DiamondLogo } from './DiamondLogo';

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
  return (
    <header className={`sticky top-0 z-40 backdrop-blur-md border-b border-[#988b8b] shadow-xl transition-colors duration-200 ${
      theme === 'light' ? 'bg-white/95 text-slate-800' : 'bg-slate-900/95 text-white'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <div
            id="brand-logo"
            onClick={() => setActiveTab('download')}
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            <div className="relative w-10 h-10 transition-transform duration-300 group-hover:scale-105 flex items-center justify-center">
              <DiamondLogo size={42} className="w-10 h-10 object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xl font-bold tracking-tight inline-block ${
                  theme === 'light' ? 'text-slate-900' : 'text-white'
                }`}>SnapTikDou</span>
              </div>
              <p className={`text-[12px] hidden sm:block ${
                theme === 'light' ? 'text-slate-500' : 'text-white border-white'
              }`}>
                Tải Video, Audio, Photo Slide trên TikTok & Douyin không dính Logo
              </p>
            </div>
          </div>

          {/* Navigation tabs & Theme toggle */}
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <button
              id="nav-tab-download"
              onClick={() => setActiveTab('download')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'download'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Tải Video</span>
            </button>

            <button
              id="nav-tab-history"
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all relative ${
                activeTab === 'history'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <History className={`w-4 h-4 ${theme === 'light' ? 'text-slate-700' : 'text-white'}`} />
              <span className={`hidden md:inline ${theme === 'light' ? 'text-slate-800 font-medium' : 'text-white'}`}>Lịch Sử</span>
              {historyCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-pink-500 text-white">
                  {historyCount}
                </span>
              )}
            </button>

            {/* Dark / Light Theme Toggle Button */}
            {onToggleTheme && (
              <button
                id="btn-toggle-theme"
                type="button"
                onClick={onToggleTheme}
                title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
                className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center cursor-pointer select-none active:scale-95 border ${
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  theme === 'light'
                    ? 'text-cyan-700 bg-cyan-50 border border-cyan-200 hover:bg-cyan-100'
                    : 'text-cyan-300 bg-cyan-950/70 border border-cyan-800/60 hover:bg-cyan-900/70'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5 text-cyan-500" />
                <span className="hidden sm:inline">Mở tab mới</span>
              </a>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};
