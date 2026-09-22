import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Play, Download, Music, Eye, Heart, MessageCircle, Share2, 
  ChevronLeft, ChevronRight, AlertCircle, Pause, Play as ResumeIcon, X
} from 'lucide-react';
import { TikTokMediaItem } from '../types';

interface MediaResultCardProps {
  media: TikTokMediaItem;
  onDownloadSingle: (
    media: TikTokMediaItem, 
    type: 'video_hd' | 'video_sd' | 'audio' | 'photos_zip' | 'photo_single', 
    photoIndex?: number
  ) => void;
  isDownloading: boolean;
  isPaused: boolean;
  onPauseDownload: () => void;
  onResumeDownload: () => void;
  onCancelDownload: () => void;
  downloadProgressText: string;
  directDownloadInfo: { url: string; filename: string } | null;
  onDirectDownload: () => void;
  showIosWarning: boolean;
  theme?: string;
}

export const MediaResultCardSkeleton: React.FC<{ theme?: string }> = () => (
  <div className="w-full max-w-2xl mx-auto bg-white rounded-[28px] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-black/[0.04] animate-pulse space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-[#E5E5EA]" />
      <div className="space-y-2 flex-1">
        <div className="h-4 bg-[#E5E5EA] rounded-md w-1/3" />
        <div className="h-3 bg-[#E5E5EA] rounded-md w-1/4" />
      </div>
    </div>
    <div className="h-48 bg-[#F2F2F7] rounded-2xl" />
    <div className="grid grid-cols-2 gap-3">
      <div className="h-14 bg-[#F2F2F7] rounded-2xl" />
      <div className="h-14 bg-[#F2F2F7] rounded-2xl" />
    </div>
  </div>
);

export const MediaResultCard: React.FC<MediaResultCardProps> = ({
  media,
  onDownloadSingle,
  isDownloading,
  isPaused,
  onPauseDownload,
  onResumeDownload,
  onCancelDownload,
  downloadProgressText,
  directDownloadInfo,
  onDirectDownload,
  showIosWarning,
}) => {
  const { t } = useTranslation();
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const isPhotos = media.mediaType === 'photos' && media.images?.length > 0;
  const totalSlides = isPhotos ? media.images.length : 0;

  const nextSlide = () => {
    setCurrentSlideIndex((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlideIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-[28px] p-5 sm:p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-black/[0.05] space-y-5 animate-in fade-in duration-300">
      
      {/* Author Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={media.author?.avatar || '/logo.svg'}
            alt={media.author?.nickname}
            className="w-11 h-11 rounded-full object-cover border border-black/[0.06] shrink-0"
          />
          <div className="min-w-0">
            <h4 className="font-semibold text-sm sm:text-base text-[#1C1C1E] truncate leading-tight">
              {media.author?.nickname || 'Creator'}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-[#8E8E93] truncate">@{media.author?.uniqueId}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F2F2F7] text-[#1C1C1E] font-medium border border-black/[0.04]">
                {media.platform === 'douyin' ? 'Douyin' : 'TikTok'}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Pill */}
        <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-full bg-[#F2F2F7] text-[11px] font-medium text-[#8E8E93] border border-black/[0.04]">
          <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-[#1C1C1E]" /> {media.stats?.plays?.toLocaleString() || 0}</span>
          <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5 text-rose-500" /> {media.stats?.likes?.toLocaleString() || 0}</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5 text-[#1C1C1E]" /> {media.stats?.comments?.toLocaleString() || 0}</span>
          <span className="flex items-center gap-1"><Share2 className="w-3.5 h-3.5 text-[#1C1C1E]" /> {media.stats?.shares?.toLocaleString() || 0}</span>
        </div>
      </div>

      {/* Main Content Preview */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
        {/* Left: Media Viewport */}
        <div className="sm:col-span-5 relative rounded-2xl overflow-hidden bg-black/5 aspect-[3/4] flex items-center justify-center border border-black/[0.06] group">
          {isPhotos ? (
            <>
              <img
                src={media.images[currentSlideIndex]}
                alt={`Slide ${currentSlideIndex + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-medium">
                {currentSlideIndex + 1} / {totalSlides}
              </div>
              {totalSlides > 1 && (
                <>
                  <button
                    onClick={prevSlide}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/80 backdrop-blur-md text-[#1C1C1E] shadow-sm hover:bg-white active:scale-95 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={nextSlide}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/80 backdrop-blur-md text-[#1C1C1E] shadow-sm hover:bg-white active:scale-95 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <img
                src={media.cover || '/logo.svg'}
                alt="Video Cover"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center text-[#1C1C1E] shadow-lg active:scale-95 hover:bg-white transition-all cursor-pointer"
              >
                <Play className="w-5 h-5 ml-0.5 fill-[#1C1C1E]" />
              </button>
            </>
          )}
        </div>

        {/* Right: Caption & Sound Details */}
        <div className="sm:col-span-7 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8E8E93]">
              {t('postCaption')}
            </span>
            <p className="text-xs sm:text-sm text-[#1C1C1E] leading-relaxed line-clamp-4 select-text">
              {media.title || 'No description available'}
            </p>
          </div>

          {/* Sound / Music Info Card */}
          <div className="p-3 rounded-2xl bg-[#F2F2F7] border border-black/[0.04] flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white text-[#007AFF] shadow-2xs shrink-0">
              <Music className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#1C1C1E] truncate">
                {media.audio?.title || 'Original Audio'}
              </p>
              <p className="text-[11px] text-[#8E8E93] truncate">
                {media.audio?.author || 'Creator'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress / Status Bar */}
      {downloadProgressText && (
        <div className="p-3.5 rounded-2xl bg-[#F2F2F7] border border-black/[0.06] flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-[#007AFF] animate-pulse shrink-0" />
            <span className="text-xs font-medium text-[#1C1C1E] truncate">
              {downloadProgressText}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isDownloading && (
              <>
                <button
                  onClick={isPaused ? onResumeDownload : onPauseDownload}
                  className="p-1.5 rounded-xl bg-white text-[#1C1C1E] shadow-2xs hover:bg-slate-50 transition"
                >
                  {isPaused ? <ResumeIcon className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={onCancelDownload}
                  className="p-1.5 rounded-xl bg-white text-rose-500 shadow-2xs hover:bg-rose-50 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* iOS Warning Notice */}
      {showIosWarning && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{t('keepScreenOnNotice')}</p>
        </div>
      )}

      {/* Direct High Speed Download Fallback Button */}
      {directDownloadInfo && (
        <button
          onClick={onDirectDownload}
          className="w-full py-2.5 px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 text-xs font-semibold flex items-center justify-center gap-2 transition"
        >
          <Download className="w-4 h-4 text-amber-700" />
          <span>{t('btnDirectDownload')}</span>
        </button>
      )}

      {/* Inset Grouped Action Buttons (Apple Photos Style) */}
      <div className="space-y-2 pt-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#8E8E93] block px-1">
          {t('downloadOptions')}
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Action 1: Tải Video HD hoặc Tải Album ZIP */}
          {isPhotos ? (
            <button
              type="button"
              onClick={() => onDownloadSingle(media, 'photos_zip')}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F2F2F7] hover:bg-[#E5E5EA] transition-all cursor-pointer text-left active:scale-[0.96]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#007AFF] shadow-2xs">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-[#1C1C1E]">
                    {t('downloadAllPhotosCount', { count: totalSlides })}
                  </h5>
                  <p className="text-[11px] text-[#8E8E93]">ZIP Archive</p>
                </div>
              </div>
              <Download className="w-4 h-4 text-[#8E8E93]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDownloadSingle(media, 'video_hd')}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F2F2F7] hover:bg-[#E5E5EA] transition-all cursor-pointer text-left active:scale-[0.96]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#007AFF] shadow-2xs">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-[#1C1C1E]">
                    {t('downloadVideoHd')}
                  </h5>
                  <p className="text-[11px] text-[#8E8E93]">MP4 1080p Original</p>
                </div>
              </div>
              <Download className="w-4 h-4 text-[#8E8E93]" />
            </button>
          )}

          {/* Action 2: Tải Audio MP3 */}
          <button
            type="button"
            onClick={() => onDownloadSingle(media, 'audio')}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F2F2F7] hover:bg-[#E5E5EA] transition-all cursor-pointer text-left active:scale-[0.96]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#007AFF] shadow-2xs">
                <Music className="w-5 h-5" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-[#1C1C1E]">
                  {t('downloadAudio')}
                </h5>
                <p className="text-[11px] text-[#8E8E93]">MP3 320kbps</p>
              </div>
            </div>
            <Download className="w-4 h-4 text-[#8E8E93]" />
          </button>
        </div>

        {/* Tùy chọn tải ảnh đơn lẻ nếu là album */}
        {isPhotos && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onDownloadSingle(media, 'photo_single', currentSlideIndex)}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#F2F2F7] border border-black/[0.06] text-xs font-semibold text-[#1C1C1E] flex items-center justify-center gap-2 transition"
            >
              <Download className="w-3.5 h-3.5 text-[#007AFF]" />
              <span>{t('btnDownloadSinglePhoto')} ({currentSlideIndex + 1})</span>
            </button>
          </div>
        )}
      </div>

      {/* Video Modal Preview */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-black rounded-3xl overflow-hidden shadow-2xl">
            <button
              onClick={() => setIsPreviewOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <video
              src={media.video?.hd || media.video?.noWatermark}
              controls
              autoPlay
              playsInline
              className="w-full h-auto max-h-[80vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
