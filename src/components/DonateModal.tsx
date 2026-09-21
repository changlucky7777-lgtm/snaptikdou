import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Coffee, Heart, Copy, Check } from 'lucide-react';

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DonateModal: React.FC<DonateModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'momo' | 'paypal'>('momo');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
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

        {/* Chuyển Tab MoMo / PayPal */}
        <div className="flex p-1 bg-slate-100 rounded-xl mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('momo')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
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
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'paypal'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('donateTabPaypal')}
          </button>
        </div>

        {/* Nội dung Tab */}
        {activeTab === 'momo' ? (
          <div className="flex flex-col items-center animate-in fade-in duration-200">
            <div className="p-2.5 bg-pink-50/50 rounded-2xl border border-pink-100 shadow-inner mb-3">
              <img
                src="/momo-qr.png?v=1"
                alt="MoMo QR"
                className="w-56 h-auto rounded-xl object-contain shadow-xs"
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium mb-3">{t('donateScanMomo')}</p>
            <div className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700">NGUYEN XUAN TRUONG</span>
              <button
                type="button"
                onClick={() => handleCopy('0934296236')}
                className="flex items-center gap-1 text-pink-600 font-bold hover:text-pink-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? t('donateCopySuccess') : 'Copy SĐT'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center animate-in fade-in duration-200">
            <div className="p-2.5 bg-blue-50/50 rounded-2xl border border-blue-100 shadow-inner mb-3">
              <img
                src="/paypal-qr.png?v=1"
                alt="PayPal QR"
                className="w-56 h-auto rounded-xl object-contain shadow-xs"
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium mb-3">{t('donateScanPaypal')}</p>
            <div className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700 truncate max-w-[170px]">TRƯỜNG NGUYỄN</span>
              <button
                type="button"
                onClick={() => handleCopy('https://paypal.me/truongnguyen063')}
                className="flex items-center gap-1 text-blue-600 font-bold hover:text-blue-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? t('donateCopySuccess') : 'Copy Link'}</span>
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
