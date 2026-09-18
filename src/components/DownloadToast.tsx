import React from 'react';
import { Loader2, CheckCircle2, Folder, X } from 'lucide-react';

interface DownloadToastProps {
  isVisible: boolean;
  progressText: string;
  isCompleted: boolean;
  onClose?: () => void;
  onSelectDirectory?: () => void;
  selectedDirName?: string | null;
}

export const DownloadToast: React.FC<DownloadToastProps> = ({
  isVisible,
  progressText,
  isCompleted,
  onClose,
  onSelectDirectory,
  selectedDirName,
}) => {
  if (!isVisible && !isCompleted) return null;

  return (
    <aside
      aria-label="Tiến trình tải xuống"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-slate-900/95 text-white backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-200"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {isCompleted ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        ) : (
          <Loader2 className="w-5 h-5 text-pink-500 animate-spin shrink-0" />
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-bold truncate">
            {isCompleted ? 'Tải về hoàn tất!' : 'Đang xử lý tải xuống'}
          </span>
          <span className="text-[11px] text-slate-300 font-mono truncate">
            {progressText || 'Đang kết nối luồng dữ liệu...'}
          </span>
          {selectedDirName && (
            <span className="text-[10px] text-pink-400 truncate flex items-center gap-1 mt-0.5">
              <Folder className="w-3 h-3 inline" /> Lưu vào: {selectedDirName}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {onSelectDirectory && 'showDirectoryPicker' in window && (
          <button
            type="button"
            onClick={onSelectDirectory}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-90 border border-slate-700 text-slate-200 text-xs flex items-center gap-1 transition"
            title="Chọn thư mục lưu"
          >
            <Folder className="w-3.5 h-3.5" />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white active:scale-90"
            title="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
};
