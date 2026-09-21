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

  // Hàm tải trực tiếp file ảnh mã QR về máy
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
      // Dự phòng nếu fetch lỗi thì mở thẻ a download trực tiếp
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-sm sm:max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title={t('donateClose')}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tiêu đề */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-pink-50 text-pink-500 mb-2.5 shadow-xs">
            <Coffee className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">{t('donateTitle')}</h3>
          <p className="text-xs text-slate-500 mt-1 px-2 leading-relaxed">{t('donateDesc')}</p>
        </div>

        {/* Bộ chuyển Tab MoMo / PayPal */}
        <div className="flex p-1 bg-slate-100 rounded-xl mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('momo')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'momo'
                ? 'bg-white text-pink-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('donateTabMomo')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('paypal')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'paypal'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('donateTabPaypal')}
          </button>
        </div>

        {/* Tab MoMo */}
        {activeTab === 'momo' ? (
          <div className="flex flex-col items-center animate-in fade-in duration-200">
            <div className="p-3 bg-pink-50/50 rounded-2xl border border-pink-100 shadow-inner mb-3 flex items-center justify-center">
              <img
                src="/momo-qr.png?v=4"
                alt="MoMo QR"
                className="w-64 sm:w-72 h-auto aspect-square rounded-xl object-contain shadow-xs"
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium mb-3">{t('donateScanMomo')}</p>
            <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700">NGUYEN XUAN TRUONG</span>
              <button
                type="button"
                onClick={() => handleDownloadImage('/momo-qr.png?v=4', 'momo-qr-snaptikdou.png')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg font-bold transition-all active:scale-95 cursor-pointer shadow-2xs"
                title={t('donateDownloadQR')}
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>{t('donateDownloadQR')}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Tab PayPal */
          <div className="flex flex-col items-center animate-in fade-in duration-200">
            <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-100 shadow-inner mb-3 flex items-center justify-center">
              <img
                src="/paypal-qr.png?v=4"
                alt="PayPal QR"
                className="w-64 sm:w-72 h-auto aspect-square rounded-xl object-contain shadow-xs"
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium mb-3">{t('donateScanPaypal')}</p>
            <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700 truncate max-w-[150px]">TRƯỜNG NGUYỄN</span>
              <button
                type="button"
                onClick={() => handleDownloadImage('/paypal-qr.png?v=4', 'paypal-qr-snaptikdou.png')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg font-bold transition-all active:scale-95 cursor-pointer shadow-2xs"
                title={t('donateDownloadQR')}
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>{t('donateDownloadQR')}</span>
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 text-center">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <Heart className="w-3 h-3 text-red-400 fill-red-400" /> Thank you for your support!
          </span>
        </div>
      </div>
    </div>
  );
};
