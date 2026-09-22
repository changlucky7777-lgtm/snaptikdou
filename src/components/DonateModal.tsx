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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-sm bg-white/95 backdrop-blur-2xl rounded-[32px] p-6 shadow-2xl border border-black/[0.06] animate-in zoom-in-95 duration-200 text-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng chuẩn iOS */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 transition cursor-pointer"
          title={t('donateClose')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Tiêu đề Modal */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-800 mb-2.5 shadow-2xs">
            <Coffee className="w-6 h-6 stroke-[2]" />
          </div>
          <h3 className="text-base font-bold text-zinc-900">{t('donateTitle')}</h3>
          <p className="text-xs text-zinc-500 mt-1 px-2 leading-relaxed">{t('donateDesc')}</p>
        </div>

        {/* Chuyển tab chuẩn iOS Segmented Control */}
        <div className="flex p-1 bg-[#E5E5EA] rounded-xl mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('momo')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'momo'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {t('donateTabMomo')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('paypal')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'paypal'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {t('donateTabPaypal')}
          </button>
        </div>

        {/* Tab MoMo */}
        {activeTab === 'momo' ? (
          <div className="flex flex-col items-center animate-in fade-in duration-200">
            <div className="p-3 bg-zinc-100/70 rounded-2xl border border-black/[0.04] mb-3 flex items-center justify-center">
              <img
                src="/momo-qr.png?v=4"
                alt="MoMo QR"
                className="w-64 h-auto aspect-square rounded-xl object-contain shadow-xs"
              />
            </div>
            <p className="text-[11px] text-zinc-400 font-medium mb-3">{t('donateScanMomo')}</p>
            <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-zinc-100 rounded-xl text-xs font-semibold text-zinc-800">
              <span>NGUYEN XUAN TRUONG</span>
              <button
                type="button"
                onClick={() => handleDownloadImage('/momo-qr.png?v=4', 'momo-qr-snaptikdou.png')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-lg text-xs font-semibold transition active:scale-[0.96] cursor-pointer shadow-xs"
                title={t('donateDownloadQR')}
              >
                <Download className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>{t('donateDownloadQR')}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Tab PayPal */
          <div className="flex flex-col items-center animate-in fade-in duration-200">
            <div className="p-3 bg-zinc-100/70 rounded-2xl border border-black/[0.04] mb-3 flex items-center justify-center">
              <img
                src="/paypal-qr.png?v=4"
                alt="PayPal QR"
                className="w-64 h-auto aspect-square rounded-xl object-contain shadow-xs"
              />
            </div>
            <p className="text-[11px] text-zinc-400 font-medium mb-3">{t('donateScanPaypal')}</p>
            <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-zinc-100 rounded-xl text-xs font-semibold text-zinc-800">
              <span className="truncate max-w-[150px]">TRƯỜNG NGUYỄN</span>
              <button
                type="button"
                onClick={() => handleDownloadImage('/paypal-qr.png?v=4', 'paypal-qr-snaptikdou.png')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-lg text-xs font-semibold transition active:scale-[0.96] cursor-pointer shadow-xs"
                title={t('donateDownloadQR')}
              >
                <Download className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>{t('donateDownloadQR')}</span>
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 text-center">
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 font-medium">
            <Heart className="w-3 h-3 text-red-500 fill-red-500" /> Thank you for your support!
          </span>
        </div>
      </div>
    </div>
  );
};
