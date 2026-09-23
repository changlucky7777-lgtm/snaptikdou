import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon } from 'lucide-react';
import { ThemeMode } from '../utils/theme';

interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  theme,
  onToggle,
  className = '',
  showLabel = false,
}) => {
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? t('switchToLightMode') : t('switchToDarkMode')}
      title={isDark ? t('switchToLightMode') : t('switchToDarkMode')}
      className={`relative inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all duration-200 cursor-pointer select-none active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
        isDark
          ? 'bg-[#1C1C20] hover:bg-[#27272D] border-white/15 text-[#F5F5F7] shadow-[0_2px_8px_rgba(0,0,0,0.6)]'
          : 'bg-[#F2F2F7] hover:bg-[#E5E5EA] border-black/[0.08] text-[#1C1C1E] shadow-2xs'
      } ${className}`}
    >
      <div className="relative w-4 h-4 flex items-center justify-center">
        {isDark ? (
          <Sun className="w-4 h-4 text-[#FFD60A] transition-transform duration-300 rotate-0 scale-100 hover:rotate-45" />
        ) : (
          <Moon className="w-4 h-4 text-[#1C1C1E] transition-transform duration-300 -rotate-12 scale-100 hover:rotate-0" />
        )}
      </div>
      {showLabel && (
        <span className="text-xs font-semibold tracking-tight hidden sm:inline">
          {isDark ? t('themeDark') : t('themeLight')}
        </span>
      )}
    </button>
  );
};
