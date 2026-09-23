import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { LANGUAGES, saveLanguage, SupportedLang } from '../i18n';

interface LanguageSelectorProps {
  onLanguageChange?: (lang: SupportedLang) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ onLanguageChange }) => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Tìm ngôn ngữ hiện tại (hoặc mặc định là Tiếng Việt)
  const currentLang =
    LANGUAGES.find((l) => i18n.language && i18n.language.startsWith(l.code)) ||
    LANGUAGES[0];

  const handleSelectLanguage = (code: SupportedLang) => {
    i18n.changeLanguage(code);
    saveLanguage(code);
    if (onLanguageChange) {
      onLanguageChange(code);
    }
    setIsOpen(false);
  };

  // Đóng dropdown khi click ra vùng ngoài
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Nút bấm mở menu ngôn ngữ */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-secondary)] text-[var(--text-primary)] text-xs sm:text-sm font-medium transition-all shadow-2xs shrink-0 cursor-pointer active:scale-[0.96]"
      >
        <img
          src={`https://flagcdn.com/w40/${currentLang.country}.png`}
          alt={currentLang.name}
          className="w-4 h-3 object-cover rounded-xs shadow-2xs shrink-0"
        />
        <span className="hidden sm:inline font-medium">{currentLang.name}</span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)] transition-transform duration-200" />
      </button>

      {/* Hộp Dropdown danh sách ngôn ngữ */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-44 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-dropdown)] py-1.5 z-50 overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          {LANGUAGES.map((lang) => {
            const isCurrent = i18n.language && i18n.language.startsWith(lang.code);
            return (
              <button
                key={lang.code}
                onClick={() => handleSelectLanguage(lang.code)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs sm:text-sm text-left transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)] font-bold'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-secondary)]'
                }`}
              >
                <img
                  src={`https://flagcdn.com/w40/${lang.country}.png`}
                  alt={lang.name}
                  className="w-4 h-3 object-cover rounded-xs shrink-0"
                />
                <span className="flex-1 truncate">
                  {lang.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
