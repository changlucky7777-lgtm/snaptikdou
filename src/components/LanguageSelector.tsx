import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
      {/* Nút bấm mở menu */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-medium transition shadow-2xs shrink-0"
      >
        <img
          src={`https://flagcdn.com/w40/${currentLang.country}.png`}
          alt={currentLang.name}
          className="w-4 h-3 object-cover rounded-xs shadow-2xs"
        />
        <span className="hidden sm:inline">{currentLang.name}</span>
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Hộp Dropdown danh sách ngôn ngữ */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50 overflow-hidden">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                handleSelectLanguage(lang.code);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs sm:text-sm text-left hover:bg-slate-50 transition text-slate-700"
            >
              <img
                src={`https://flagcdn.com/w40/${lang.country}.png`}
                alt={lang.name}
                className="w-4 h-3 object-cover rounded-xs shrink-0"
              />
              <span className={`flex-1 ${i18n.language === lang.code ? 'text-pink-600 font-bold' : ''}`}>
                {lang.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
