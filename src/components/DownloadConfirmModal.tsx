import React from 'react';
import { X } from 'lucide-react';

interface DownloadConfirmModalProps {
  isOpen: boolean;
  filename: string;
  onClose: () => void;
  onConfirmDownload: () => void;
  onViewDirectly?: () => void;
}

export const DownloadConfirmModal: React.FC<DownloadConfirmModalProps> = ({
  isOpen,
  filename,
  onClose,
  onConfirmDownload,
  onViewDirectly,
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-[340px] bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-5 animate-in zoom-in-95 duration-150 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng góc phải */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1 rounded-full text-slate-400 hover:text-slate-600 transition"
          aria-label="Đóng"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Thông báo chuẩn Safari */}
        <div className="pr-6 pt-1 text-[15px] leading-snug font-normal text-slate-900">
          Bạn có muốn tải về{' '}
          <span className="font-semibold break-all text-slate-950">
            "{filename}"
          </span>{' '}
          trên "snaptikdou.com" không?
        </div>

        {/* Nút hành động */}
        <div className="mt-6 flex items-center justify-end gap-6 text-[15px] font-medium">
          {onViewDirectly && (
            <button
              type="button"
              onClick={onViewDirectly}
              className="text-sky-500 hover:text-sky-600 transition"
            >
              Xem
            </button>
          )}
          <button
            type="button"
            onClick={onConfirmDownload}
            className="text-sky-600 hover:text-sky-700 font-semibold transition"
          >
            Tải về
          </button>
        </div>
      </div>
    </div>
  );
};
