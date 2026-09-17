import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  X,
  Loader2,
  Sparkles,
  AlertCircle,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react';

interface UrlInputBarProps {
  url: string;
  setUrl: (url: string) => void;
  onExtract: (targetUrl?: string) => void;
  isLoading: boolean;
  error?: string | null;
  theme?: 'dark' | 'light';
}

export const UrlInputBar: React.FC<UrlInputBarProps> = ({
  url,
  setUrl,
  onExtract,
  isLoading,
  error,
  theme = 'dark',
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [copiedError, setCopiedError] = useState(false);

  const handleCopyErrorForAI = () => {
    const errorPrompt = `Fix the errors in the app
[AIS_METADATA_SECTION_START]
error: ${error || 'Unknown error'}
targetUrl: ${url}
[AIS_METADATA_SECTION_END]`;
    navigator.clipboard.writeText(errorPrompt);
    setCopiedError(true);
    setTimeout(() => setCopiedError(false), 2000);
  };

  // Instant 1-Touch Mobile & Desktop Paste Handler
  const handlePaste = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.stopPropagation();
    }

    // Direct window focus to ensure document activation for Clipboard API
    if (typeof window !== 'undefined') {
      window.focus();
    }

    const applyUrl = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      setUrl(trimmed); // Chỉ gán link vào ô nhập, không tự động gọi onExtract
      setPasteNotice('Đã dán!');
      setTimeout(() => setPasteNotice(null), 2000);

      inputRef.current?.focus();
      return true;
    };

    // 1. Primary: Modern Clipboard API readText directly in user gesture
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const text = await navigator.clipboard.readText();
        if (applyUrl(text)) {
          return;
        }
      } catch (err) {
        console.warn('Clipboard readText attempt:', err);
      }
    }

    // 2. Secondary: Clipboard API read() with text/plain blob (iOS Safari support)
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.read === 'function') {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types && item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            const text = await blob.text();
            if (applyUrl(text)) {
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Clipboard read blob attempt:', err);
      }
    }

    // 3. Fallback: execCommand paste on input
    try {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
        const success = document.execCommand('paste');
        if (success && inputRef.current.value) {
          if (applyUrl(inputRef.current.value)) {
            return;
          }
        }
      }
    } catch {}

    // 4. Focus input if browser strictly locks programmatic reading
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Detect native paste event directly inside input
  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted) {
      setPasteNotice('Đã dán!');
      setTimeout(() => setPasteNotice(null), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading && url.trim()) {
      onExtract();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3">
      {/* Row 1: URL Input Box with distinct frame + Paste Button */}
      <div className="w-full flex items-center gap-2 sm:gap-3">
        {/* Input field with distinct border frame */}
        <div
          style={{ borderRadius: '17px' }}
          className={`relative flex-1 flex items-center rounded-xl border transition-all duration-200 ${
          theme === 'light'
            ? 'bg-slate-50 border-slate-300 focus-within:border-pink-500 focus-within:ring-1 focus-within:ring-pink-500/30'
            : 'bg-slate-950/70 border-slate-700 focus-within:border-pink-500 focus-within:ring-1 focus-within:ring-pink-500/30'
        }`}>
          <Search className="absolute left-3 sm:left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            id="tiktok-url-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={handleInputPaste}
            onKeyDown={handleKeyDown}
            placeholder={t('inputPlaceholder')}
            style={{
              height: '34px',
              marginLeft: '0px',
              marginRight: '0px',
              marginTop: '0px',
              marginBottom: '0px',
              paddingLeft: '34px',
              paddingRight: '34px',
              paddingTop: '0px',
              paddingBottom: '2px',
              borderWidth: '0px',
              borderRadius: '16px',
            }}
            className={`w-full h-[34px] m-0 pl-[34px] pr-[34px] pt-0 pb-[2px] bg-transparent text-[11px] sm:text-xs focus:outline-none focus:ring-0 ${
              theme === 'light'
                ? 'text-slate-900 placeholder-slate-400'
                : 'text-white placeholder-slate-400'
            }`}
            disabled={isLoading}
          />

          {/* Clear button */}
          {url && (
            <button
              id="btn-clear-url"
              type="button"
              onClick={() => {
                setUrl('');
                inputRef.current?.focus();
              }}
              className={`absolute right-2.5 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 ${
                theme === 'light'
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title="Xóa link"
            >
              <X className="w-3 h-3 stroke-[2.5]" />
            </button>
          )}
        </div>

        {/* Paste button beside the input */}
        <button
          id="btn-paste-url"
          type="button"
          onClick={handlePaste}
          style={{ height: '34px', minWidth: '44px' }}
          className={`flex items-center justify-center h-[34px] px-3 rounded-xl border border-solid transition-all shadow-sm touch-manipulation cursor-pointer select-none active:scale-95 shrink-0 text-xs font-semibold ${
            theme === 'light'
              ? 'text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border-slate-300'
              : 'text-white bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border-slate-700 hover:border-slate-600'
          }`}
          title="Dán từ bộ nhớ tạm"
        >
          <span
            className={`inline-flex items-center justify-center whitespace-nowrap ${
              pasteNotice ? 'text-pink-500 font-bold' : (theme === 'light' ? 'text-slate-700' : 'text-slate-200')
            }`}
          >
            {pasteNotice || t('btnPaste')}
          </span>
        </button>
      </div>

      {/* Row 2: Extract button (centered) */}
      <button
        id="btn-extract-tiktok"
        type="button"
        onClick={() => onExtract()}
        disabled={isLoading || !url.trim()}
        style={{ borderRadius: '21px' }}
        className={`px-6 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all duration-200 whitespace-nowrap shadow-md touch-manipulation min-h-[40px] mx-auto ${
          isLoading || !url.trim()
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            : 'bg-gradient-to-r from-pink-600 via-rose-600 to-pink-500 text-white hover:from-pink-500 hover:to-rose-500 shadow-pink-600/30 hover:scale-[1.02] active:scale-[0.98]'
        }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('extracting')}</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            <span>{t('btnExtract')}</span>
          </>
        )}
      </button>

      {/* Error alert with Interactive Fix Button */}
      {error && (
        <div className="mt-3 p-3.5 sm:p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold text-red-200 flex items-center gap-1.5">
                <span>Phát hiện lỗi:</span>
              </div>
              <span className="text-red-300 text-xs leading-relaxed">{error}</span>
            </div>
          </div>

          {/* Action buttons: Copy, Retry */}
          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
            {/* Copy prompt for AI */}
            <button
              type="button"
              onClick={handleCopyErrorForAI}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition"
              title="Sao chép lỗi để dán vào khung chat AI Studio"
            >
              {copiedError ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Đã copy!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* Retry button */}
            <button
              type="button"
              onClick={() => onExtract()}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="Thử lại"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
