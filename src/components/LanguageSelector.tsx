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
        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-xs sm:text-sm font-medium text-slate-200 transition shrink-0"
        title="Change language"
      >
        {/* Hiển thị cờ */}
        <span className="text-sm">{currentLang.flag}</span>
        
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

      {/* Danh sách thả xuống có thanh cuộn giống SnapTik */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-52 max-h-72 overflow-y-auto rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-50 py-1.5 scrollbar-thin scrollbar-thumb-slate-700">
          {LANGUAGES.map((lang) => {
            const isSelected = currentLang.code === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => handleSelectLanguage(lang.code)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors ${
                  isSelected
                    ? 'text-pink-500 font-semibold bg-pink-500/10'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{lang.flag}</span>
                  <span>{lang.name}</span>
                </div>
                {isSelected && (
                  <svg className="w-4 h-4 text-pink-500" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
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
