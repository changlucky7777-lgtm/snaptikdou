import React, { useState } from 'react';
import {
  Trash2,
  Download,
  Search,
  Film,
  Music,
  Image as ImageIcon,
  ExternalLink,
  HardDrive,
} from 'lucide-react';
import { HistoryRecord } from '../types';

interface HistorySectionProps {
  records: HistoryRecord[];
  onClearHistory: () => void;
  onReDownload: (record: HistoryRecord) => void;
  theme?: 'dark' | 'light';
}

function formatHistoryDateTime(dateInput: string | number | Date): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedHours = String(hours).padStart(2, '0');
  const timeStr = `${formattedHours}:${minutes} ${ampm}`;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const dateStr = `${day}-${month}-${year}`;

  return `${timeStr} ${dateStr}`;
}

export const HistorySection: React.FC<HistorySectionProps> = ({
  records,
  onClearHistory,
  onReDownload,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio' | 'photos'>('all');

  const filtered = records.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.authorUniqueId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.authorNickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.savedPath.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || r.mediaType === filterType;
    return matchesSearch && matchesType;
  });

  // Calculate unique channels
  const uniqueChannels = Array.from(new Set(records.map((r) => r.authorUniqueId)));

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300 min-w-0 overflow-hidden">
      
      {/* Top summary card */}
      <div
        className={`rounded-2xl sm:rounded-3xl p-4 sm:p-6 border transition-colors shadow-xl ${
          isLight
            ? 'bg-white border-slate-200 shadow-slate-200/50'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        {records.length > 0 && (
          <div className="flex justify-end mb-4">
            <button
              onClick={onClearHistory}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                isLight
                  ? 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                  : 'text-slate-400 hover:text-red-400 hover:bg-slate-800'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa lịch sử</span>
            </button>
          </div>
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <div
            className={`p-3 rounded-xl border transition-colors ${
              isLight ? 'bg-slate-50 border-slate-200/90' : 'bg-slate-950/60 border-slate-800/80'
            }`}
          >
            <div className={`text-xs ${isLight ? 'text-slate-500 font-medium' : 'text-slate-400'}`}>
              Tổng lượt tải
            </div>
            <div className={`text-lg font-extrabold mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {records.length}
            </div>
          </div>
          <div
            className={`p-3 rounded-xl border transition-colors ${
              isLight ? 'bg-slate-50 border-slate-200/90' : 'bg-slate-950/60 border-slate-800/80'
            }`}
          >
            <div className={`text-xs ${isLight ? 'text-slate-500 font-medium' : 'text-slate-400'}`}>
              Kênh đã lưu
            </div>
            <div className={`text-lg font-extrabold mt-0.5 ${isLight ? 'text-pink-600' : 'text-pink-400'}`}>
              {uniqueChannels.length}
            </div>
          </div>
          <div
            className={`p-3 rounded-xl border transition-colors ${
              isLight ? 'bg-slate-50 border-slate-200/90' : 'bg-slate-950/60 border-slate-800/80'
            }`}
          >
            <div className={`text-xs ${isLight ? 'text-slate-500 font-medium' : 'text-slate-400'}`}>
              Video
            </div>
            <div className={`text-lg font-extrabold mt-0.5 ${isLight ? 'text-sky-600' : 'text-cyan-400'}`}>
              {records.filter((r) => r.mediaType === 'video').length}
            </div>
          </div>
          <div
            className={`p-3 rounded-xl border transition-colors ${
              isLight ? 'bg-slate-50 border-slate-200/90' : 'bg-slate-950/60 border-slate-800/80'
            }`}
          >
            <div className={`text-xs ${isLight ? 'text-slate-500 font-medium' : 'text-slate-400'}`}>
              Photo Slide & Audio
            </div>
            <div className={`text-lg font-extrabold mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
              {records.filter((r) => r.mediaType !== 'video').length}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      {records.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isLight ? 'text-slate-400' : 'text-slate-400'}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên kênh, tiêu đề hoặc đường dẫn..."
              className={`w-full pl-10 pr-4 py-2 border rounded-xl text-xs transition-colors focus:outline-none focus:border-pink-500 ${
                isLight
                  ? 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 shadow-sm'
                  : 'bg-slate-900 border-slate-700 text-white placeholder-slate-400'
              }`}
            />
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {(['all', 'video', 'audio', 'photos'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  filterType === type
                    ? 'bg-pink-600 text-white shadow-md'
                    : isLight
                    ? 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {type === 'all'
                  ? 'Tất cả'
                  : type === 'video'
                  ? 'Video'
                  : type === 'audio'
                  ? 'Audio'
                  : 'Photo Slide'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Records list */}
      {records.length === 0 ? (
        <div
          className={`border border-dashed rounded-3xl p-12 text-center transition-colors ${
            isLight
              ? 'bg-white border-slate-300 text-slate-600 shadow-sm'
              : 'bg-slate-900/50 border-slate-800 text-slate-400'
          }`}
        >
          <HardDrive className={`w-12 h-12 mx-auto mb-3 ${isLight ? 'text-slate-400' : 'text-slate-600'}`} />
          <h3 className={`text-sm font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            Chưa có lịch sử tải nào
          </h3>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className={`border rounded-3xl p-8 text-center text-xs transition-colors ${
            isLight
              ? 'bg-white border-slate-200 text-slate-500 shadow-sm'
              : 'bg-slate-900/50 border-slate-800 text-slate-400'
          }`}
        >
          Không tìm thấy kết quả phù hợp với bộ lọc.
        </div>
      ) : (
        <div className="space-y-2.5 w-full min-w-0">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 transition w-full min-w-0 overflow-hidden ${
                isLight
                  ? 'bg-white border-slate-200 hover:border-pink-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start sm:items-center gap-3 w-full min-w-0 flex-1">
                {item.cover ? (
                  <img
                    src={item.cover}
                    alt=""
                    className={`w-12 h-16 object-cover rounded-xl border flex-shrink-0 ${
                      isLight ? 'border-slate-200' : 'border-slate-700'
                    }`}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className={`w-12 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isLight ? 'bg-slate-100 text-slate-400' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {item.mediaType === 'video' ? (
                      <Film className="w-5 h-5" />
                    ) : item.mediaType === 'audio' ? (
                      <Music className="w-5 h-5" />
                    ) : (
                      <ImageIcon className="w-5 h-5" />
                    )}
                  </div>
                )}

                <div className="min-w-0 flex-1 w-full overflow-hidden">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span
                      className={`text-xs font-bold truncate max-w-[140px] sm:max-w-[180px] ${
                        isLight ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {item.authorNickname}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded truncate max-w-[110px] ${
                        isLight
                          ? 'bg-pink-50 text-pink-600 border border-pink-200'
                          : 'bg-slate-800 text-pink-400'
                      }`}
                    >
                      @{item.authorUniqueId}
                    </span>
                    <span className={`text-[10px] shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                      {formatHistoryDateTime(item.downloadedAt)}
                    </span>
                  </div>

                  <p className={`text-xs line-clamp-2 mt-1 break-words ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {item.title}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div
                className={`flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-2.5 sm:pt-0 flex-shrink-0 ${
                  isLight ? 'border-slate-200' : 'border-slate-800/80'
                }`}
              >
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`p-2 rounded-lg transition ${
                    isLight
                      ? 'text-slate-400 hover:text-pink-600 hover:bg-pink-50'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Mở TikTok"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>

                <button
                  onClick={() => onReDownload(item)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    isLight
                      ? 'bg-slate-100 hover:bg-pink-600 text-slate-700 hover:text-white border border-slate-200'
                      : 'bg-slate-800 hover:bg-pink-600 text-slate-200 hover:text-white'
                  }`}
                  title="Tải lại file này"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải lại</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
