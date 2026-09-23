import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Coffee, Heart, Download } from 'lucide-react';

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DonateModal: React.FC<DonateModalProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  const isVietnamese = i18n.language === 'vi' || i18n.language?.startsWith('vi-');
  const [activeTab, setActiveTab] = useState<'momo' | 'paypal'>(isVietnamese ? 'momo' : 'paypal');

  useEffect(() => {
    if (isOpen) {
      const isVi = i18n.language === 'vi' || i18n.language?.startsWith('vi-');
      setActiveTab(isVi ? 'momo' : 'paypal');
    }
  }, [isOpen, i18n.language]);

  if (!isOpen) return null;

  const handleDownloadImage = async (imgUrl: string, fileName: string) => {
    try {
      const response = await fetch(imgUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      const link = document.createElement('a');
      link.href = imgUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--modal-backdrop)] backdrop-blur-xl animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-sm bg-[var(--bg-surface)] rounded-[28px] p-6 shadow-[var(--shadow-dropdown)] border border-[var(--border-subtle)] animate-in zoom-in-95 duration-200 text-[var(--text-primary)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng chuẩn iOS */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer active:scale-[0.94]"
          title={t('donateClose')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Tiêu đề & Cốc cà phê */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--bg-surface-secondary)] text-[var(--text-primary)] mb-2.5 shadow-2xs">
            <Coffee className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-primary)]">{t('donateTitle')}</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1 px-2 leading-relaxed">{t('donateDesc')}</p>
        </div>

        {/* Segmented Control chuẩn iOS */}
        <div className="flex p-1 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('momo')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'momo'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t('donateTabMomo')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('paypal')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'paypal'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t('donateTabPaypal')}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'momo' ? (
          <div className="flex flex-col items-center animate-in fade-in duration-200">
            <div className="p-3 bg-white rounded-2xl border border-[var(--border-subtle)] shadow-sm mb-3 flex items-center justify-center">
              <img
                src="/momo-qr.png?v=4"
                alt="MoMo QR"
                className="w-64 h-auto aspect-square rounded-xl object-contain"
              />
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] font-medium mb-3">{t('donateScanMomo')}</p>
            <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl text-xs">
              <span className="font-semibold text-[var(--text-primary)]">NGUYEN XUAN TRUONG</span>
              <button
                type="button"
                onClick={() => handleDownloadImage('/momo-qr.png?v=4', 'momo-qr-snaptikdou.png')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white rounded-lg font-semibold transition-all active:scale-[0.96] cursor-pointer shadow-2xs"
                title={t('donateDownloadQR')}
              >
                <Download className="w-3.5 h-3.5 text-white" />
                <span>{t('donateDownloadQR')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center animate-in fade-in duration-200">
            <div className="p-3 bg-white rounded-2xl border border-[var(--border-subtle)] shadow-sm mb-3 flex items-center justify-center">
              <img
                src="/paypal-qr.png?v=4"
                alt="PayPal QR"
                className="w-64 h-auto aspect-square rounded-xl object-contain"
              />
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] font-medium mb-3">{t('donateScanPaypal')}</p>
            <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-xl text-xs">
              <span className="font-semibold text-[var(--text-primary)] truncate max-w-[150px]">TRƯỜNG NGUYỄN</span>
              <button
                type="button"
                onClick={() => handleDownloadImage('/paypal-qr.png?v=4', 'paypal-qr-snaptikdou.png')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white rounded-lg font-semibold transition-all active:scale-[0.96] cursor-pointer shadow-2xs"
                title={t('donateDownloadQR')}
              >
                <Download className="w-3.5 h-3.5 text-white" />
                <span>{t('donateDownloadQR')}</span>
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 text-center">
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
            <Heart className="w-3 h-3 text-[var(--text-secondary)]" /> Thank you for your support!
          </span>
        </div>
      </div>
    </div>
  );
};
