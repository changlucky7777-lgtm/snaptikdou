import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Clipboard, X, Sparkles, Loader2 } from 'lucide-react';

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
  const [isPasted, setIsPasted] = useState(false);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setIsPasted(true);
        setTimeout(() => setIsPasted(false), 2000);
      }
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onExtract(url);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3 px-2">
      <div className="relative flex items-center bg-white/90 backdrop-blur-md rounded-2xl p-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-black/[0.08] focus-within:border-[#007AFF] focus-within:ring-2 focus-within:ring-[#007AFF]/20 transition-all">
        <div className="pl-3 pr-2 text-[#8E8E93]">
          <Search className="w-5 h-5" />
        </div>
        
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('inputPlaceholder')}
          className="w-full bg-transparent text-sm sm:text-base text-[#1C1C1E] placeholder:text-[#8E8E93] focus:outline-none py-2"
        />

        {url ? (
          <button
            type="button"
            onClick={() => setUrl('')}
            className="p-1.5 text-[#8E8E93] hover:text-[#1C1C1E] rounded-full transition-colors cursor-pointer mr-1"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePaste}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#1C1C1E] text-xs font-semibold transition-all cursor-pointer mr-1"
          >
            <Clipboard className="w-3.5 h-3.5 text-[#8E8E93]" />
            <span>{isPasted ? t('pasted') : t('btnPaste')}</span>
          </button>
        )}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => onExtract(url)}
          disabled={isLoading || !url.trim()}
          className={`flex items-center justify-center gap-2 px-8 py-3 rounded-full text-sm font-semibold transition-all cursor-pointer shadow-sm ${
            isLoading || !url.trim()
              ? 'bg-[#E5E5EA] text-[#8E8E93] cursor-not-allowed'
              : 'bg-[#1C1C1E] text-white hover:bg-black active:scale-[0.96]'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>{t('extracting')}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-[#007AFF]" />
              <span>{t('btnExtract')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
