import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon } from 'lucide-react';
import { ThemeMode } from '../utils/theme';

interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  theme,
  onToggle,
  className = '',
}) => {
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? t('switchToLightMode') : t('switchToDarkMode')}
      title={isDark ? t('switchToLightMode') : t('switchToDarkMode')}
      className={`flex items-center justify-center px-2.5 py-1.5 rounded-full bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] active:scale-[0.96] transition-all cursor-pointer shadow-2xs ${className}`}
    >
      {isDark ? (
        <Sun className="w-3.5 h-3.5 text-amber-400 transition-transform duration-300 hover:rotate-45" />
      ) : (
        <Moon className="w-3.5 h-3.5 text-[var(--text-primary)] transition-transform duration-300 -rotate-12" />
      )}
    </button>
  );
};
