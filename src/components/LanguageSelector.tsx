import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';

export const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Tìm ngôn ngữ hiện tại (hoặc mặc định là Tiếng Việt)
  const currentLang =
    LANGUAGES.find((l) => i18n.language && i18n.language.startsWith(l.code)) ||
    LANGUAGES[0];

  const handleSelectLanguage = (code: string) => {
    i18n.changeLanguage(code);
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
      {/* Nút bấm Languages thu gọn */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-xs sm:text-sm font-medium text-slate-200 transition shrink-0"
        title="Change language"
      >
        {/* Ảnh lá cờ siêu nét */}
        <img
          src={`https://flagcdn.com/w40/${currentLang.country}.png`}
          alt={currentLang.name}
          className="w-5 h-3.5 object-cover rounded-sm shadow-sm"
          loading="lazy"
        />
        
        {/* Tên ngôn ngữ chỉ hiện trên màn hình sm trở lên */}
        <span className="hidden sm:inline font-medium">{currentLang.name}</span>

        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Danh sách thả xuống có thanh cuộn */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-52 max-h-72 overflow-y-auto rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-50 py-1.5 scrollbar-thin scrollbar-thumb-slate-700">
          {LANGUAGES.map((lang) => {
            const isSelected = currentLang.code === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => handleSelectLanguage(lang.code)}
                className={`w-full flex items-center justify-between px-3.5 py-2 text-sm text-left transition-colors ${
                  isSelected
                    ? 'text-pink-400 font-semibold bg-pink-500/10'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src={`https://flagcdn.com/w40/${lang.country}.png`}
                    alt={lang.name}
                    className="w-5 h-3.5 object-cover rounded-sm shrink-0 shadow-sm"
                    loading="lazy"
                  />
                  <span>{lang.name}</span>
                </div>
                {isSelected && (
                  <svg className="w-4 h-4 text-pink-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
