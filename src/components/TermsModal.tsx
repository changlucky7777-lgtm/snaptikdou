import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileText, ShieldAlert } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TermsModal({ isOpen, onClose }: TermsModalProps) {
  const { t } = useTranslation();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-slate-200/90 shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center border border-pink-100">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              {t('termsContent.title')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title={t('btnClose')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-5 sm:px-6 py-5 overflow-y-auto space-y-4 text-sm leading-relaxed text-slate-600">
          <p className="text-slate-700 font-medium bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            {t('termsContent.intro')}
          </p>

          <div className="space-y-4 pt-1">
            {/* Mục 1 */}
            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                {t('termsContent.sec1_title')}
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 pl-3.5 leading-relaxed">
                {t('termsContent.sec1_desc')}
              </p>
            </div>

            {/* Mục 2 */}
            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                {t('termsContent.sec2_title')}
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 pl-3.5 leading-relaxed">
                {t('termsContent.sec2_desc')}
              </p>
            </div>

            {/* Mục 3 */}
            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                {t('termsContent.sec3_title')}
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 pl-3.5 leading-relaxed">
                {t('termsContent.sec3_desc')}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
          >
            {t('btnClose')}
          </button>
        </div>
      </div>
    </div>
  );
}
