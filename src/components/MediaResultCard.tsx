import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Play, Download, Music, Eye, Heart, MessageCircle, Share2, 
  ChevronLeft, ChevronRight, Pause, Play as ResumeIcon, X, Film, Info, Images, Image as ImageIcon
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
  <div className="w-full max-w-2xl mx-auto bg-[var(--bg-surface)] rounded-[28px] p-6 shadow-[var(--shadow-card)] border border-[var(--border-subtle)] animate-pulse space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-[var(--bg-surface-secondary)]" />
      <div className="space-y-2 flex-1">
        <div className="h-4 bg-[var(--bg-surface-secondary)] rounded-md w-1/3" />
        <div className="h-3 bg-[var(--bg-surface-secondary)] rounded-md w-1/4" />
      </div>
    </div>
    <div className="h-48 bg-[var(--bg-surface-secondary)] rounded-2xl" />
    <div className="grid grid-cols-2 gap-3">
      <div className="h-14 bg-[var(--bg-surface-secondary)] rounded-2xl" />
      <div className="h-14 bg-[var(--bg-surface-secondary)] rounded-2xl" />
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
}) => {
  const { t } = useTranslation();
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const isMobileDevice = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isPhotos = media.mediaType === 'photos' && media.images?.length > 0;
  const totalSlides = isPhotos ? media.images.length : 0;
  const videoPreviewSrc = media.video?.hd || media.video?.noWatermark || '';

  // Hàm format dung lượng cho Video MP4 kèm dấu ~
  const formatSizeMb = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '';
    return ` • ~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const nextSlide = () => {
    setCurrentSlideIndex((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlideIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  // Hàm tải ảnh bìa gốc (Cover HD)
  const handleDownloadCover = () => {
    const coverUrl = media.cover || (isPhotos ? media.images[0] : '');
    if (!coverUrl) return;
    const a = document.createElement('a');
    a.href = `/api/tiktok/download?url=${encodeURIComponent(coverUrl)}&filename=${encodeURIComponent(`@${media.author.uniqueId}_cover.jpg`)}`;
    a.download = `@${media.author.uniqueId}_cover.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-[var(--bg-surface)] rounded-[28px] p-5 sm:p-7 shadow-[var(--shadow-card)] border border-[var(--border-subtle)] space-y-5 animate-in fade-in duration-300 text-[var(--text-primary)]">
      
      {/* Tác giả & Số liệu */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={media.author?.avatar || '/logo.svg'}
            alt={media.author?.nickname}
            className="w-11 h-11 rounded-full object-cover border border-[var(--border-subtle)] shrink-0"
          />
          <div className="min-w-0">
            <h4 className="font-semibold text-sm sm:text-base text-[var(--text-primary)] truncate leading-tight">
              {media.author?.nickname || 'Creator'}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-[var(--text-secondary)] truncate">@{media.author?.uniqueId}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--badge-bg)] text-[var(--badge-text)] font-medium border border-[var(--border-subtle)]">
                {media.platform === 'douyin' ? 'Douyin' : 'TikTok'}
              </span>
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-full bg-[var(--bg-surface-secondary)] text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]">
          <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-[var(--text-primary)]" /> {media.stats?.plays?.toLocaleString() || 0}</span>
          <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5 text-rose-500" /> {media.stats?.likes?.toLocaleString() || 0}</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5 text-[var(--text-primary)]" /> {media.stats?.comments?.toLocaleString() || 0}</span>
          <span className="flex items-center gap-1"><Share2 className="w-3.5 h-3.5 text-[var(--text-primary)]" /> {media.stats?.shares?.toLocaleString() || 0}</span>
        </div>
      </div>

      {/* Cụm xem nội dung */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
        {/* Bên trái: Thumbnail / Viewport & Dải Thumbnail Strip */}
        <div className="sm:col-span-5 space-y-2">
          <div className="relative rounded-2xl overflow-hidden bg-black/10 aspect-[3/4] flex items-center justify-center border border-[var(--border-subtle)] group">
            {isPhotos ? (
              <>
                <img
                  src={media.images[currentSlideIndex]}
                  alt={`Slide ${currentSlideIndex + 1}`}
                  className="w-full h-full object-cover transition-opacity duration-200"
                />
                
                {/* Badge đếm số ảnh */}
                <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-[11px] font-medium shadow-xs border border-white/10">
                  {currentSlideIndex + 1} / {totalSlides}
                </div>

                {/* Nút tải ảnh đơn đang xem */}
                <button
                  type="button"
                  onClick={() => onDownloadSingle(media, 'photo_single', currentSlideIndex)}
                  className="absolute top-2.5 right-2.5 p-2 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white shadow-md active:scale-[0.92] transition-all cursor-pointer z-10 flex items-center justify-center border border-white/10"
                  title={`${t('downloadPhotoSingle')} (${currentSlideIndex + 1})`}
                >
                  <Download className="w-4 h-4 text-white" />
                </button>

                {/* Mũi tên tới / lui */}
                {totalSlides > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prevSlide}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white shadow-sm hover:bg-black/80 active:scale-95 transition-all cursor-pointer border border-white/10"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={nextSlide}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white shadow-sm hover:bg-black/80 active:scale-95 transition-all cursor-pointer border border-white/10"
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
                {/* Nút Play trung tâm */}
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-white/95 backdrop-blur-md flex items-center justify-center text-[#1C1C1E] shadow-lg active:scale-95 hover:bg-white transition-all cursor-pointer z-10 border border-black/5"
                  title={t('openVideo')}
                >
                  <Play className="w-5 h-5 ml-0.5 fill-[#1C1C1E] text-[#1C1C1E]" />
                </button>

                {/* Nút nhỏ Mở video */}
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="absolute bottom-2.5 left-2.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md text-white text-[11px] font-semibold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer z-10 shadow-sm border border-white/10"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>{t('openVideo')}</span>
                </button>

                {/* Nút tải ảnh bìa gốc (Cover HD) */}
                <button
                  type="button"
                  onClick={handleDownloadCover}
                  className="absolute bottom-2.5 right-2.5 p-2 rounded-full bg-black/70 hover:bg-black/85 backdrop-blur-md text-white shadow-sm active:scale-95 transition-all cursor-pointer z-10 border border-white/10"
                  title={t('downloadCover')}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Dải Thumbnail Strip cuộn ngang phong cách iOS Photos */}
          {isPhotos && totalSlides > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 no-scrollbar scroll-smooth">
              {media.images.map((imgUrl, index) => {
                const isActive = index === currentSlideIndex;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setCurrentSlideIndex(index)}
                    className={`relative shrink-0 w-11 h-11 rounded-xl overflow-hidden border-2 transition-all cursor-pointer active:scale-95 ${
                      isActive 
                        ? 'border-[var(--accent-blue)] shadow-xs scale-105' 
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img 
                      src={imgUrl} 
                      alt={`Thumbnail ${index + 1}`} 
                      className="w-full h-full object-cover" 
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bên phải: Tiêu đề & Dòng âm thanh */}
        <div className="sm:col-span-7 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              {t('postCaption')}
            </span>
            <p className="text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed line-clamp-4 select-text">
              {media.title || 'No description available'}
            </p>

            {/* Dòng âm thanh inline */}
            {media.audio && (
              <div className="flex items-center gap-1.5 pt-1 text-xs text-[var(--text-secondary)]">
                <Music className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                <span className="truncate text-[var(--text-primary)] font-medium">
                  {media.audio.title || 'Original Audio'}
                </span>
                {media.audio.author && (
                  <span className="truncate text-[var(--text-secondary)]">
                    — {media.audio.author}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Thanh tiến trình tải */}
      {downloadProgressText && (
        <div className="space-y-2 animate-in fade-in duration-200">
          <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-blue)] animate-pulse shrink-0" />
              <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {downloadProgressText}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isDownloading && (
                <>
                  <button
                    type="button"
                    onClick={isPaused ? onResumeDownload : onPauseDownload}
                    className="p-1.5 rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-2xs hover:bg-[var(--bg-surface-tertiary)] transition cursor-pointer"
                    title={isPaused ? 'Resume' : 'Pause'}
                  >
                    {isPaused ? <ResumeIcon className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelDownload}
                    className="p-1.5 rounded-xl bg-[var(--bg-surface)] text-rose-500 border border-[var(--border-subtle)] shadow-2xs hover:bg-rose-500/10 transition cursor-pointer"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fallback tốc độ cao */}
      {directDownloadInfo && (
        <button
          type="button"
          onClick={onDirectDownload}
          className="w-full py-2.5 px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-semibold flex items-center justify-center gap-2 border border-amber-500/20 transition cursor-pointer"
        >
          <Download className="w-4 h-4 text-amber-500" />
          <span>{t('btnDirectDownload')}</span>
        </button>
      )}

      {/* Danh sách các nút tải phương tiện */}
      <div className="space-y-2 pt-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block px-1">
          {t('downloadOptions')}
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Nút Video HD hoặc Nút Album ZIP */}
          {isPhotos ? (
            <button
              type="button"
              onClick={() => onDownloadSingle(media, 'photos_zip')}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-tertiary)] border border-[var(--border-subtle)] transition-all cursor-pointer text-left active:scale-[0.96]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center text-[var(--accent-blue)] border border-[var(--border-subtle)] shadow-2xs shrink-0">
                  <Images className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-[var(--text-primary)]">
                    {t('downloadAllPhotosCount', { count: totalSlides })}
                  </h5>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {t('originalPhotosCount', { count: totalSlides })}
                  </p>
                </div>
              </div>
              <Download className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDownloadSingle(media, 'video_hd')}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-tertiary)] border border-[var(--border-subtle)] transition-all cursor-pointer text-left active:scale-[0.96]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center text-[var(--accent-blue)] border border-[var(--border-subtle)] shadow-2xs shrink-0">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-[var(--text-primary)]">
                    {t('downloadVideoHd')}
                  </h5>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {t('originalVideoSubtitle')}{formatSizeMb(media.video?.hdSize || media.video?.size)}
                  </p>
                </div>
              </div>
              <Download className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
          )}

          {/* Nút Tải Audio MP3 */}
          <button
            type="button"
            onClick={() => onDownloadSingle(media, 'audio')}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-tertiary)] border border-[var(--border-subtle)] transition-all cursor-pointer text-left active:scale-[0.96]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center text-[var(--accent-blue)] border border-[var(--border-subtle)] shadow-2xs shrink-0">
                <Music className="w-5 h-5" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-[var(--text-primary)]">
                  {t('downloadAudio')}
                </h5>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {t('originalAudio')}
                </p>
              </div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Dòng chú ý cố định riêng cho thiết bị di động */}
        {isMobileDevice && (
          <div className="pt-2 px-1 text-center">
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed flex items-center justify-center gap-1.5 font-normal">
              <Info className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
              <span>{t('mobileKeepOpenNotice')}</span>
            </p>
          </div>
        )}
      </div>

      {/* Modal xem trước video tại chỗ */}
      {isPreviewOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--modal-backdrop)] backdrop-blur-xl animate-in fade-in duration-200"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div 
            className="relative w-full max-w-md bg-black rounded-3xl overflow-hidden shadow-2xl flex flex-col items-center justify-center max-h-[90vh] border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-md"
              title="Đóng xem trước"
            >
              <X className="w-5 h-5" />
            </button>

            <video
              src={videoPreviewSrc}
              controls
              autoPlay
              playsInline
              className="w-full h-auto max-h-[82vh] object-contain rounded-3xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
