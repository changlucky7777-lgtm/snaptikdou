import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Clipboard, ArrowRight } from 'lucide-react';

interface UrlInputBarProps {
  url: string;
  setUrl: (url: string) => void;
  onExtract: (url?: string) => void;
  isLoading: boolean;
  theme?: string;
}

export const UrlInputBar: React.FC<UrlInputBarProps> = ({
  url,
  setUrl,
  onExtract,
  isLoading,
}) => {
  const { t } = useTranslation();
  const [pasteSuccess, setPasteSuccess] = useState(false);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setPasteSuccess(true);
        setTimeout(() => setPasteSuccess(false), 1500);
      }
    } catch {
      // Fallback nếu không xin được quyền truy cập clipboard
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      e.preventDefault();
      onExtract(url);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-1 space-y-3">
      {/* Khung tìm kiếm phong cách Search Spotlight iOS */}
      <div className="relative flex items-center bg-white/90 backdrop-blur-xl border border-black/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.06)] rounded-2xl p-1.5 transition-all focus-within:ring-2 focus-within:ring-[#007AFF]/40 focus-within:border-[#007AFF]">
        <div className="pl-3 pr-2 text-zinc-400 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-zinc-400 stroke-[2.2]" />
        </div>

        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('inputPlaceholder')}
          className="w-full bg-transparent py-2.5 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
        />

        {url ? (
          <button
            type="button"
            onClick={() => setUrl('')}
            className="p-1.5 mr-1 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100 transition"
            title="Clear"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePaste}
            className="flex items-center gap-1 mr-1 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 text-xs font-semibold tracking-tight transition"
          >
            <Clipboard className="w-3.5 h-3.5" />
            <span>{pasteSuccess ? t('pasted') : t('btnPaste')}</span>
          </button>
        )}

        {/* Nút Lấy link màu đen sâu hoặc xanh Apple */}
        <button
          type="button"
          onClick={() => onExtract(url)}
          disabled={isLoading}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-tight text-white transition-all shadow-sm ${
            isLoading
              ? 'bg-zinc-400 cursor-not-allowed'
              : 'bg-[#1C1C1E] hover:bg-black active:scale-[0.96]'
          }`}
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>{t('btnExtract')}</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
