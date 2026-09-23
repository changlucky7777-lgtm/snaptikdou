import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Clipboard, X, Sparkles, Loader2, ArrowRight } from 'lucide-react';

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
  const [detectedLink, setDetectedLink] = useState<string | null>(null);
  const lastCheckedClipboardRef = useRef<string>('');
  const dismissTimerRef = useRef<any>(null);

  // Hàm quét Clipboard thông minh
  const checkClipboard = async () => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return;
      const text = await navigator.clipboard.readText();
      const trimmed = (text || '').trim();
      
      // Nếu rỗng, hoặc trùng với link đang có, hoặc đã từng dismiss
      if (!trimmed || trimmed === url.trim() || trimmed === lastCheckedClipboardRef.current) {
        return;
      }

      // Kiểm tra có phải link TikTok / Douyin
      const isMediaUrl = /(tiktok\.com|douyin\.com|iesdouyin\.com)/i.test(trimmed);
      if (isMediaUrl) {
        setDetectedLink(trimmed);
        
        // Tự biến mất sau 8 giây nếu người dùng không thao tác
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = setTimeout(() => {
          setDetectedLink(null);
        }, 8000);
      }
    } catch {
      // Bỏ qua nếu trình duyệt chặn quyền đọc clipboard khi chưa tương tác
    }
  };

  useEffect(() => {
    // 1. Quét khi người dùng quay lại tab/mở lại trình duyệt
    const handleFocus = () => {
      checkClipboard();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkClipboard();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [url]);

  const handleApplyDetectedLink = () => {
    if (!detectedLink) return;
    const link = detectedLink;
    lastCheckedClipboardRef.current = link;
    setDetectedLink(null);
    setUrl(link);
    onExtract(link);
  };

  const handleDismissDetectedLink = () => {
    if (detectedLink) {
      lastCheckedClipboardRef.current = detectedLink;
    }
    setDetectedLink(null);
  };

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
      {/* THANH GỢI Ý AUTO-PASTE CLIPBOARD THÔNG MINH (Chuẩn Apple Floating Capsule) */}
      {detectedLink && (
        <div className="flex items-center justify-between gap-2 p-2 px-3.5 rounded-2xl bg-white/95 backdrop-blur-xl border border-[#007AFF]/25 shadow-[0_4px_16px_rgba(0,122,255,0.08)] animate-in fade-in slide-in-from-top-2 duration-300">
          <div 
            onClick={handleApplyDetectedLink}
            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none"
          >
            <div className="w-2 h-2 rounded-full bg-[#007AFF] animate-ping shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#1C1C1E] truncate">
                {t('clipboardDetected')}
              </p>
              <p className="text-[11px] text-[#8E8E93] truncate">
                {detectedLink}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleApplyDetectedLink}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#007AFF] hover:bg-[#007AFF]/90 text-white text-xs font-semibold shadow-2xs active:scale-[0.96] transition-all cursor-pointer"
            >
              <span>{t('btnPasteAndExtract')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDismissDetectedLink}
              className="p-1.5 rounded-full text-[#8E8E93] hover:text-[#1C1C1E] hover:bg-[#F2F2F7] transition cursor-pointer"
              title="Đóng"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Ô nhập link dạng Safari Pill */}
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

      {/* Nút hành động chính */}
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
