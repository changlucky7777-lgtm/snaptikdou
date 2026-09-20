import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  Music,
  Film,
  Image as ImageIcon,
  Copy,
  Check,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Rocket,
  Play,
  Pause,
  X,
} from 'lucide-react';
import { TikTokMediaItem, AudioProgressState } from '../types';

interface MediaResultCardProps {
  media: TikTokMediaItem;
  onDownloadSingle: (
    media: TikTokMediaItem,
    type: 'video_hd' | 'video_sd' | 'audio' | 'photos_zip' | 'photo_single',
    photoIndex?: number
  ) => Promise<void>;
  isDownloading: boolean;
  isPaused?: boolean;
  onPauseDownload?: () => void;
  onResumeDownload?: () => void;
  onCancelDownload?: () => void;
  downloadProgressText?: string;
  directDownloadInfo?: { url: string; filename: string } | null;
  onDirectDownload?: () => void;
  audioProgress?: AudioProgressState | null;
  onTogglePauseAudio?: () => void;
  onCancelAudioDownload?: () => void;
  theme?: 'dark' | 'light';
}

export const MediaResultCard: React.FC<MediaResultCardProps> = ({
  media,
  onDownloadSingle,
  isDownloading,
  isPaused = false,
  onPauseDownload,
  onResumeDownload,
  onCancelDownload,
  downloadProgressText,
  directDownloadInfo,
  onDirectDownload,
  audioProgress,
  onTogglePauseAudio,
  onCancelAudioDownload,
  theme = 'dark',
}) => {
  const { t } = useTranslation();
  const isLight = theme === 'light';
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isPlayingVideo, setIsVideoPlaying] = useState(false);

  const handleCopyDirectLink = (url: string) => {
    let finalUrl = url;
    if (
      media.platform === 'douyin' ||
      url.includes('zjcdn.com') ||
      url.includes('douyinvod.com') ||
      url.includes('douyin.com') ||
      url.includes('snssdk.com')
    ) {
      const cleanTitle = (media.title || 'douyin_video')
        .replace(/[^\w\s\u4e00-\u9fa5\u00C0-\u1EF9_-]/gi, '')
        .trim()
        .slice(0, 40) || 'douyin_video';
      finalUrl = `${window.location.origin}/api/tiktok/download?url=${encodeURIComponent(url)}&postUrl=${encodeURIComponent(media.url)}&filename=${encodeURIComponent(cleanTitle + '.mp4')}`;
    }
    navigator.clipboard.writeText(finalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const isPhotoSlide = media.mediaType === 'photos' && media.images?.length > 0;

  // Quá trình truyền dữ liệu thực sự bắt đầu khi thông số tiến trình cụ thể hiển thị (ví dụ: 0.0/15.2 MB (0%) hoặc 3.5/38.9 MB (9%))
  // Khi hoàn tất (100% hoặc thông báo thành công) hoặc khi đã hủy, nút Tải tốc độ cao và cụm điều khiển sẽ ẩn đi ngay lập tức
  const isCompleted =
    !isDownloading ||
    Boolean(
      downloadProgressText &&
        (downloadProgressText.includes('100%') ||
          downloadProgressText.toLowerCase().includes('thành công') ||
          downloadProgressText.toLowerCase().includes('đã hủy'))
    );

  const hasTransferStarted =
    isDownloading &&
    !isCompleted &&
    (isPaused ||
      Boolean(
        downloadProgressText &&
          (/\d+(\.\d+)?\s*(\/|\s*MB|\s*KB|\s*%)|\d+%/i.test(downloadProgressText) ||
            downloadProgressText.includes('MB') ||
            downloadProgressText.includes('%'))
      ));

  // Format caption text: highlight hashtags
  const renderFormattedCaption = (text: string) => {
    if (!text) return 'Không có mô tả';
    const words = text.split(' ');
    return words.map((word, i) => {
      if (word.startsWith('#')) {
        return (
          <span
            key={i}
            className={`${isLight ? 'text-pink-600 font-semibold' : 'text-pink-400 font-medium'} hover:underline cursor-default`}
          >
            {word}{' '}
          </span>
        );
      }
      if (word.startsWith('@')) {
        return (
          <span
            key={i}
            className={`${isLight ? 'text-sky-600 font-semibold' : 'text-cyan-400 font-medium'} hover:underline cursor-default`}
          >
            {word}{' '}
          </span>
        );
      }
      return word + ' ';
    });
  };

  return (
    <div
      className={`w-full max-w-4xl mx-auto rounded-3xl overflow-hidden animate-in fade-in-50 duration-300 transition-colors ${
        isLight
          ? 'bg-white border border-slate-200 shadow-xl shadow-slate-200/50'
          : 'bg-slate-900 border border-slate-800 shadow-2xl'
      }`}
    >
      {/* Top Banner: Author Channel Info & Stats */}
      <div
        className={`p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 transition-colors ${
          isLight
            ? 'bg-slate-50/90 border-b border-slate-200'
            : 'bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="relative flex-shrink-0">
            {media.author.avatar ? (
              <img
                src={media.author.avatar}
                alt={media.author.nickname}
                className={`w-13 h-13 rounded-2xl object-cover border-2 shadow-md ${
                  isLight
                    ? 'border-pink-500/50 shadow-pink-500/10'
                    : 'border-pink-500/40 shadow-pink-500/10'
                }`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-400 flex items-center justify-center text-white font-bold text-lg border-2 border-pink-500/40">
                {media.author.uniqueId[0]?.toUpperCase() || 'T'}
              </div>
            )}
            <span
              className={`absolute -bottom-1 -right-1 w-4.5 h-4.5 bg-cyan-500 rounded-full flex items-center justify-center text-slate-950 font-black text-[10px] ring-2 ${
                isLight ? 'ring-white' : 'ring-slate-900'
              }`}
            >
              ✓
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                className={`text-base sm:text-lg font-bold tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {media.author.nickname}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-mono font-medium ${
                  isLight
                    ? 'bg-pink-50 text-pink-600 border border-pink-200'
                    : 'bg-slate-800 text-pink-400 border border-pink-500/20'
                }`}
              >
                @{media.author.uniqueId}
              </span>
              {media.platform === 'douyin' ? (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                    isLight
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  <span>🇨🇳 Douyin (抖音)</span>
                </span>
              ) : (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                    isLight
                      ? 'bg-sky-50 text-sky-700 border border-sky-200'
                      : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  }`}
                >
                  <span>TikTok</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Engagement Stats */}
        <div
          className={`flex items-center gap-3 text-xs px-3.5 py-2 rounded-xl border transition-colors ${
            isLight
              ? 'bg-white text-slate-600 border-slate-200 shadow-sm'
              : 'bg-slate-950/70 text-slate-400 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-1" title="Lượt xem">
            <Eye className={`w-3.5 h-3.5 ${isLight ? 'text-sky-600' : 'text-cyan-400'}`} />
            <span className={isLight ? 'text-slate-700 font-medium' : ''}>
              {media.stats.plays ? Number(media.stats.plays).toLocaleString() : '---'}
            </span>
          </div>
          <div className="flex items-center gap-1" title="Lượt thích">
            <Heart className={`w-3.5 h-3.5 ${isLight ? 'text-pink-600' : 'text-pink-400'}`} />
            <span className={isLight ? 'text-slate-700 font-medium' : ''}>
              {media.stats.likes ? Number(media.stats.likes).toLocaleString() : '---'}
            </span>
          </div>
          <div className="flex items-center gap-1" title="Bình luận">
            <MessageCircle className={`w-3.5 h-3.5 ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`} />
            <span className={isLight ? 'text-slate-700 font-medium' : ''}>
              {media.stats.comments ? Number(media.stats.comments).toLocaleString() : '---'}
            </span>
          </div>
          <div className="flex items-center gap-1" title="Chia sẻ">
            <Share2 className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <span className={isLight ? 'text-slate-700 font-medium' : ''}>
              {media.stats.shares ? Number(media.stats.shares).toLocaleString() : '---'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area: Harmonious 2-Column Balanced Grid */}
      <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Media Player / Photo Slide Preview */}
        <div className="lg:col-span-3 xl:col-span-3 flex flex-col items-center lg:items-start gap-3">
          <div
            className={`relative w-full max-w-[170px] aspect-[9/16] max-h-[270px] rounded-2xl overflow-hidden border flex items-center justify-center mx-auto lg:mx-0 ${
              isLight
                ? 'bg-slate-100 border-slate-200 shadow-sm'
                : 'bg-slate-950 border-slate-800 shadow-inner'
            }`}
          >
            {isPhotoSlide ? (
              // Photo slide viewer
              <div className={`relative w-full h-full flex items-center justify-center ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
                <img
                  src={media.images[currentPhotoIndex]}
                  alt={`Slide ${currentPhotoIndex + 1}`}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />

                {/* Download single active photo button */}
                <button
                  type="button"
                  onClick={() => onDownloadSingle(media, 'photo_single', currentPhotoIndex)}
                  disabled={isDownloading}
                  title={t('btnDownloadSinglePhoto')}
                  aria-label={t('btnDownloadSinglePhoto')}
                  className="absolute top-2.5 right-2.5 p-2 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-sm transition active:scale-95 cursor-pointer z-10"
                >
                  <Download className="w-4 h-4" />
                </button>

                {/* Slider controls */}
                {media.images.length > 1 && (
                  <>
                    <button
                      onClick={() =>
                        setCurrentPhotoIndex((prev) =>
                          prev === 0 ? media.images.length - 1 : prev - 1
                        )
                      }
                      className="absolute left-2.5 p-2 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-sm transition active:scale-95"
                      title="Ảnh trước"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() =>
                        setCurrentPhotoIndex((prev) =>
                          prev === media.images.length - 1 ? 0 : prev + 1
                        )
                      }
                      className="absolute right-2.5 p-2 rounded-full bg-black/60 hover:bg-black/85 text-white backdrop-blur-sm transition active:scale-95"
                      title="Ảnh tiếp"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>

                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/75 backdrop-blur-md rounded-full text-xs text-white font-mono border border-white/10 shadow-lg">
                      {currentPhotoIndex + 1} / {media.images.length} {t('photoUnit')}
                    </div>
                  </>
                )}
              </div>
            ) : isPlayingVideo && (media.video.noWatermark || media.video.hd) ? (
              // Active Video Player
              <div className="relative w-full h-full bg-black flex items-center justify-center">
                <video
                  src={media.video.noWatermark || media.video.hd}
                  controls
                  autoPlay
                  poster={media.cover}
                  className="w-full h-full object-contain"
                  playsInline
                />
                <button
                  type="button"
                  onClick={() => setIsVideoPlaying(false)}
                  className="absolute top-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/70 hover:bg-black/90 text-white text-[10px] font-semibold backdrop-blur-sm border border-white/10 transition z-10 cursor-pointer"
                  title={t('btnClose')}
                >
                  ✕ {t('btnClose')}
                </button>
              </div>
            ) : (
              // Video Thumbnail Cover with Play & Mở video Badge
              <div
                id="video-preview-trigger"
                onClick={() => setIsVideoPlaying(true)}
                className="relative w-full h-full group cursor-pointer select-none"
                title="Nhấn để mở xem video"
              >
                <img
                  src={media.cover}
                  alt={media.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  referrerPolicy="no-referrer"
                />
                {/* Center Play Button Overlay */}
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                  <div className="w-11 h-11 rounded-full bg-pink-600 group-hover:bg-pink-500 shadow-xl shadow-pink-600/50 flex items-center justify-center transition-transform group-hover:scale-110">
                    <Play className="w-5 h-5 text-white fill-white translate-x-0.5" />
                  </div>
                </div>

                {/* Bottom Center "Mở video" pill badge */}
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/80 group-hover:bg-black/95 backdrop-blur-md text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-white/10 shadow-xl transition-all group-hover:scale-105 whitespace-nowrap">
                  <Film className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                  <span>{t('openVideo')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Photo Slide Thumbnail Strip */}
          {isPhotoSlide && media.images.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
              {media.images.map((imgUrl, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPhotoIndex(idx)}
                  className={`flex-shrink-0 w-12 h-16 rounded-xl overflow-hidden border-2 transition ${
                    currentPhotoIndex === idx
                      ? 'border-pink-500 scale-105 shadow-md shadow-pink-500/20'
                      : isLight
                      ? 'border-slate-200 opacity-70 hover:opacity-100'
                      : 'border-slate-800 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img
                    src={imgUrl}
                    alt={`Thumb ${idx + 1}`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Content Details & Download Options */}
        <div className="lg:col-span-9 xl:col-span-9 flex flex-col gap-5">
          
          {/* Post Description / Caption */}
          <div
            className={`p-4 rounded-2xl border space-y-3 transition-colors ${
              isLight
                ? 'bg-slate-50/80 border-slate-200/90'
                : 'bg-slate-950/70 border-slate-800/80'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
              <span className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                {t('postCaption')}
              </span>
            </div>
            <p
              className={`text-sm leading-relaxed break-words font-normal ${
                isLight ? 'text-slate-800' : 'text-slate-200'
              }`}
            >
              {renderFormattedCaption(media.title)}
            </p>

            {/* Background Music Info */}
            {media.audio?.title && (
              <div
                className={`pt-2 border-t flex items-center gap-2.5 text-xs ${
                  isLight
                    ? 'border-slate-200 text-slate-700'
                    : 'border-slate-800/60 text-slate-300'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg border flex-shrink-0 ${
                    isLight
                      ? 'bg-pink-50 text-pink-600 border-pink-200'
                      : 'bg-pink-500/10 text-[#ea5cd9] border-pink-500/20'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                </div>
                <div className="truncate">
                  <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                    {media.audio.title}
                  </span>
                  {media.audio.author && (
                    <span className={`ml-1.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      — {media.audio.author}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Download Options List / Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              {/* Tiêu đề bên trái */}
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold text-base">
                <Download className="w-5 h-5 text-emerald-500" />
                <span>{t('downloadOptions') || 'Tùy chọn tải về'}</span>
              </div>

              {/* KHU VỰC BÊN PHẢI: Thanh tiến trình MP3 thay thế vị trí số 2 */}
              <div className="flex items-center gap-2 flex-wrap">
                {audioProgress ? (
                  <div className="flex items-center gap-3 bg-sky-50/90 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 px-3 py-1.5 rounded-full shadow-xs animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <div className="w-20 sm:w-28 h-2 bg-sky-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-150 rounded-full ${
                            audioProgress.isPaused
                              ? 'bg-amber-500'
                              : audioProgress.percent === 100
                              ? 'bg-emerald-500'
                              : 'bg-sky-500'
                          }`}
                          style={{ width: `${Math.max(4, audioProgress.percent)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {audioProgress.percent === 100
                          ? 'Sẵn sàng lưu tệp...'
                          : audioProgress.isPaused
                          ? 'Đã tạm dừng'
                          : `${audioProgress.currentMB}/${audioProgress.totalMB} MB (${audioProgress.percent}%)`}
                      </span>
                    </div>

                    {/* Nút Tạm dừng / Tiếp tục (ẩn đi khi đã đạt 100% để lưu) */}
                    {audioProgress.percent < 100 && (
                      <button
                        type="button"
                        onClick={onTogglePauseAudio}
                        className="p-1 rounded-full hover:bg-sky-200/60 dark:hover:bg-slate-700 text-sky-600 dark:text-sky-400 active:scale-90 transition-transform cursor-pointer"
                        title={audioProgress.isPaused ? 'Tiếp tục tải' : 'Tạm dừng'}
                      >
                        {audioProgress.isPaused ? (
                          <Play className="w-3.5 h-3.5 fill-current text-emerald-600" />
                        ) : (
                          <Pause className="w-3.5 h-3.5 fill-current text-sky-600" />
                        )}
                      </button>
                    )}

                    {/* Nút Hủy tải xuống */}
                    <button
                      type="button"
                      onClick={onCancelAudioDownload}
                      className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 text-slate-400 hover:text-red-500 active:scale-90 transition-transform cursor-pointer"
                      title="Hủy tải xuống"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : downloadProgressText ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-pink-500" />
                    <span>{downloadProgressText}</span>
                  </div>
                ) : null}

                {/* Vị trí số 4: Nút Tải xuống tốc độ cao (chỉ xuất hiện sau khi quá trình tải thông thường không tải được) */}
                {directDownloadInfo && !isDownloading && (
                  <button
                    id="btn-direct-download-pos4"
                    type="button"
                    onClick={onDirectDownload}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 border border-emerald-400/40 shadow-md transition-all duration-200 animate-in fade-in slide-in-from-right-3 cursor-pointer"
                    title="Tải xuống tốc độ cao"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    <span>Tải xuống tốc độ cao</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {isPhotoSlide ? (
                /* Option Photo Slide Package (All Photos in ZIP) */
                <button
                  id="btn-download-photos-zip"
                  onClick={() => onDownloadSingle(media, 'photos_zip')}
                  disabled={isDownloading}
                  className={`group relative flex items-center justify-between p-4 rounded-2xl border text-left transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer ${
                    isLight
                      ? 'bg-white hover:bg-amber-50/40 border-slate-200 hover:border-amber-400 shadow-sm hover:shadow-md'
                      : 'bg-slate-850/90 hover:bg-slate-800 border-slate-700/80 hover:border-amber-500/60 shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`p-2.5 rounded-xl border group-hover:scale-105 transition ${
                        isLight
                          ? 'bg-amber-50 text-amber-600 border-amber-200'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                      }`}
                    >
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-sm font-bold transition ${
                            isLight
                              ? 'text-slate-900 group-hover:text-amber-600'
                              : 'text-white group-hover:text-amber-300'
                          }`}
                        >
                          {t('downloadAllPhotosCount', { count: media.images.length })}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            isLight
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          }`}
                        >
                          ZIP
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {t('downloadPhotos')}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`p-2 rounded-xl transition shadow-sm ${
                      isLight
                        ? 'bg-slate-100 text-slate-700 group-hover:bg-amber-600 group-hover:text-white'
                        : 'bg-slate-800 text-slate-400 group-hover:bg-amber-600 group-hover:text-white'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                  </div>
                </button>
              ) : (
                /* Option 1: Video HD Không Logo (1080p) */
                <button
                  id="btn-download-video-hd"
                  type="button"
                  onClick={() => onDownloadSingle(media, 'video_hd')}
                  disabled={isDownloading}
                  title={t('downloadVideoHd')}
                  className={`group relative flex items-center justify-between p-4 rounded-2xl border text-left transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer ${
                    isLight
                      ? 'bg-white hover:bg-pink-50/40 border-pink-200 hover:border-pink-400 shadow-sm hover:shadow-md'
                      : 'border-pink-500/40 bg-gradient-to-br from-slate-850 to-slate-900 hover:from-slate-800 hover:to-slate-850 hover:border-pink-500/70 shadow-lg shadow-pink-950/20'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="p-2.5 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-500 text-white shadow-md shadow-pink-500/20 group-hover:scale-105 transition">
                      <Film className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-sm font-bold transition ${
                            isLight
                              ? 'text-slate-900 group-hover:text-pink-600'
                              : 'text-white group-hover:text-pink-300'
                          }`}
                        >
                          {t('downloadVideoHd')}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            isLight
                              ? 'bg-pink-100 text-pink-700 border-pink-200'
                              : 'bg-pink-500/20 text-white border-pink-500/30'
                          }`}
                        >
                          1080p
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {t('downloadVideoHdSub')}
                      </p>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/30 group-hover:scale-105 transition">
                    <Download className="w-4 h-4" />
                  </div>
                </button>
              )}

              {/* Option 2: Tải Audio MP3 */}
              <button
                id="btn-download-audio"
                type="button"
                onClick={() => onDownloadSingle(media, 'audio')}
                disabled={isDownloading || (!media.audio?.url && !media.video?.noWatermark)}
                title={t('downloadAudio')}
                className={`group relative flex items-center justify-between p-4 rounded-2xl border text-left transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
                  !media.audio?.url && !media.video?.noWatermark
                    ? isLight
                      ? 'bg-slate-100 border-slate-200 opacity-40 cursor-not-allowed'
                      : 'bg-slate-900/40 border-slate-800 opacity-40 cursor-not-allowed'
                    : isLight
                    ? 'bg-white hover:bg-indigo-50/40 border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-md cursor-pointer'
                    : 'border-slate-700/80 bg-slate-850/90 hover:bg-slate-800 hover:border-indigo-500/60 shadow-md cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`p-2.5 rounded-xl border group-hover:scale-105 transition ${
                      isLight
                        ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                        : 'bg-indigo-500/15 text-[#d95dd3] border-indigo-500/20'
                    }`}
                  >
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-bold transition ${
                          isLight
                            ? 'text-slate-900 group-hover:text-indigo-600'
                            : 'text-white group-hover:text-indigo-300'
                        }`}
                      >
                        {t('downloadAudio')}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          isLight
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-indigo-500/15 text-white border-indigo-500/30'
                        }`}
                      >
                        320kbps
                      </span>
                    </div>
                    <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t('downloadAudioSub')}
                    </p>
                  </div>
                </div>
                <div
                  className={`p-2 rounded-xl transition shadow-sm ${
                    isLight
                      ? 'bg-slate-100 text-slate-700 group-hover:bg-indigo-600 group-hover:text-white'
                      : 'bg-slate-800 text-[#fcfcfc] group-hover:bg-indigo-600 group-hover:text-white'
                  }`}
                >
                  <Download className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>

          {/* Storage & Utility Footer */}
          <div
            className={`pt-3 border-t flex items-center justify-start gap-6 text-xs transition-colors ${
              isLight ? 'border-slate-200 text-slate-600' : 'border-slate-800/80 text-white'
            }`}
          >
            <button
              type="button"
              onClick={() => handleCopyDirectLink(media.video.hd || media.video.noWatermark || media.url)}
              className={`flex items-center gap-1.5 transition cursor-pointer ${
                isLight ? 'text-slate-600 hover:text-pink-600' : 'text-slate-300 hover:text-white'
              }`}
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 font-medium">{t('copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('copyLink')}</span>
                </>
              )}
            </button>

            <a
              href={media.url}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center gap-1 transition ${
                isLight ? 'text-slate-600 hover:text-pink-600' : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>{t('openPlatform')}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Hướng dẫn tải về khi nút Tải xuống tốc độ cao xuất hiện */}
          {directDownloadInfo && !isDownloading && (
            <div
              id="direct-download-guide-box"
              className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-300 ${
                isLight
                  ? 'bg-emerald-50/90 border-emerald-300 text-slate-700 shadow-emerald-500/5'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-slate-200 shadow-emerald-950/30'
              }`}
            >
              <div className="flex-1 space-y-1">
                <div
                  className={`font-bold flex items-center gap-1.5 ${
                    isLight ? 'text-emerald-800' : 'text-emerald-400'
                  }`}
                >
                  <span>💡 Hướng dẫn Tải xuống tốc độ cao:</span>
                </div>
                <div className={`text-xs sm:text-[13px] leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  Nhấn vào <strong className={`${isLight ? 'text-emerald-700' : 'text-emerald-300'} font-semibold`}>Tải xuống tốc độ cao</strong> <span className={`${isLight ? 'text-emerald-600' : 'text-emerald-400'} font-bold mx-1`}>=&gt;</span> Nhấn vào ô có <strong className={`${isLight ? 'text-slate-900' : 'text-white'} font-semibold`}>dấu 3 chấm</strong> ở tab Trình chiếu (Media Player) <span className={`${isLight ? 'text-emerald-600' : 'text-emerald-400'} font-bold mx-1`}>=&gt;</span> <strong className={`${isLight ? 'text-emerald-700' : 'text-emerald-300'} font-semibold`}>Download (Tải xuống)</strong>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export const MediaResultCardSkeleton: React.FC<{ theme?: 'dark' | 'light' }> = ({ theme = 'dark' }) => {
  const { t } = useTranslation();
  const isLight = theme === 'light';

  return (
    <div
      id="media-skeleton-card"
      className={`w-full max-w-4xl mx-auto rounded-3xl overflow-hidden animate-pulse duration-700 border transition-colors ${
        isLight
          ? 'bg-white border-slate-200 shadow-xl shadow-slate-200/50'
          : 'bg-slate-900/90 border-slate-800 shadow-2xl'
      }`}
    >
      {/* Top Banner Skeleton: Author Channel Info & Stats */}
      <div
        className={`p-4 sm:p-5 border-b flex flex-wrap items-center justify-between gap-4 transition-colors ${
          isLight
            ? 'bg-slate-50/90 border-slate-200'
            : 'bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3.5">
          {/* Avatar Skeleton */}
          <div
            className={`w-13 h-13 rounded-2xl flex-shrink-0 border-2 ${
              isLight ? 'bg-slate-200 border-slate-300' : 'bg-slate-800/90 border-slate-700/50'
            }`}
          />

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Nickname Skeleton */}
              <div className={`h-5 w-32 rounded-lg ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
              {/* Unique ID Skeleton */}
              <div className={`h-4.5 w-24 rounded-full ${isLight ? 'bg-slate-150' : 'bg-slate-800/70'}`} />
              {/* Platform Badge Skeleton */}
              <div className={`h-4.5 w-16 rounded-full ${isLight ? 'bg-slate-150' : 'bg-slate-800/50'}`} />
            </div>
          </div>
        </div>

        {/* Engagement Stats Skeleton */}
        <div
          className={`flex items-center gap-3 px-3.5 py-2 rounded-xl border transition-colors ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-950/70 border-slate-800/80'
          }`}
        >
          <div className={`h-3.5 w-14 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
          <div className={`h-3.5 w-14 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
          <div className={`h-3.5 w-12 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
          <div className={`h-3.5 w-12 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
        </div>
      </div>

      {/* Main Content Skeleton Area: 2-Column Balanced Grid */}
      <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Media Player Preview Skeleton */}
        <div className="lg:col-span-3 xl:col-span-3 flex flex-col items-center lg:items-start gap-3">
          <div
            className={`relative w-full max-w-[170px] aspect-[9/16] max-h-[270px] rounded-2xl overflow-hidden border flex flex-col items-center justify-center mx-auto lg:mx-0 p-4 ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center mb-3 ${
                isLight ? 'bg-slate-200' : 'bg-slate-800/90'
              }`}
            >
              <Loader2 className="w-5 h-5 text-pink-500 animate-spin" />
            </div>
            <div className={`h-2.5 w-20 rounded-full ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
            <div
              className={`absolute bottom-2.5 left-1/2 -translate-x-1/2 w-[94px] h-6 rounded-full border ${
                isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
              }`}
            />
          </div>
        </div>

        {/* Right Column: Content Details & Download Options Skeleton */}
        <div className="lg:col-span-9 xl:col-span-9 flex flex-col gap-5">
          {/* Post Description / Caption Skeleton */}
          <div
            className={`p-4 rounded-2xl border space-y-3 transition-colors ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800/80'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-pink-500/60" />
              <div className={`h-3 w-28 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
            </div>
            <div className="space-y-2 pt-1">
              <div className={`h-3.5 w-full rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800/80'}`} />
              <div className={`h-3.5 w-5/6 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800/60'}`} />
              <div className={`h-3.5 w-3/5 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800/50'}`} />
            </div>

            {/* Background Music Info Skeleton */}
            <div
              className={`pt-2 border-t flex items-center gap-2.5 ${
                isLight ? 'border-slate-200' : 'border-slate-800/60'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg border flex-shrink-0 ${
                  isLight ? 'bg-pink-50 border-pink-200' : 'bg-pink-500/10 border-pink-500/20'
                }`}
              />
              <div className={`h-3.5 w-44 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800/70'}`} />
            </div>
          </div>

          {/* Download Options Skeleton */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded ${isLight ? 'bg-slate-300' : 'bg-slate-800'}`} />
                <div className={`h-3.5 w-36 rounded ${isLight ? 'bg-slate-300' : 'bg-slate-800'}`} />
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-500 text-xs font-semibold">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{t('extractingData')}</span>
              </div>
            </div>

            {/* Download Option Buttons Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1 Skeleton */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
                  isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-850/80'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`w-10 h-10 rounded-xl flex-shrink-0 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                  <div className="space-y-1.5">
                    <div className={`h-4 w-32 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                    <div className={`h-3 w-40 rounded ${isLight ? 'bg-slate-100' : 'bg-slate-800/60'}`} />
                  </div>
                </div>
                <div className={`w-8 h-8 rounded-xl flex-shrink-0 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
              </div>

              {/* Option 2 Skeleton */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${
                  isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-850/80'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`w-10 h-10 rounded-xl flex-shrink-0 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                  <div className="space-y-1.5">
                    <div className={`h-4 w-28 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                    <div className={`h-3 w-36 rounded ${isLight ? 'bg-slate-100' : 'bg-slate-800/60'}`} />
                  </div>
                </div>
                <div className={`w-8 h-8 rounded-xl flex-shrink-0 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
              </div>
            </div>
          </div>

          {/* Footer Utility Skeleton */}
          <div
            className={`pt-3 border-t flex items-center justify-start gap-6 transition-colors ${
              isLight ? 'border-slate-200' : 'border-slate-800/80'
            }`}
          >
            <div className={`h-3.5 w-28 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800/60'}`} />
            <div className={`h-3.5 w-24 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800/60'}`} />
          </div>
        </div>
      </div>
    </div>
  );
};
