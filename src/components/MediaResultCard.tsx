import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Download, 
  Music, 
  Film, 
  Images, 
  ExternalLink, 
  Heart, 
  MessageCircle, 
  Play, 
  Check, 
  Copy,
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
  isPaused?: boolean;
  onPauseDownload?: () => void;
  onResumeDownload?: () => void;
  onCancelDownload?: () => void;
  downloadProgressText?: string;
  directDownloadInfo?: any;
  onDirectDownload?: () => void;
  showIosWarning?: boolean;
  theme?: string;
}

export const MediaResultCard: React.FC<MediaResultCardProps> = ({
  media,
  onDownloadSingle,
  isDownloading,
  downloadProgressText,
}) => {
  const { t } = useTranslation();
  const [copiedLink, setCopiedLink] = useState(false);
  const isPhotos = media.mediaType === 'photos' || (media.images && media.images.length > 0);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(media.url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 animate-in fade-in duration-300">
      {/* Khung thẻ chính - Bo góc Squircle Apple, viền mờ */}
      <div className="bg-white/90 backdrop-blur-xl rounded-[28px] p-5 sm:p-6 border border-black/[0.06] shadow-[0_12px_40px_rgba(0,0,0,0.04)] space-y-5">
        
        {/* Tác giả & Thống kê */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <img
              src={media.author?.avatar || '/logo.svg'}
              alt={media.author?.nickname}
              className="w-11 h-11 rounded-full object-cover border border-black/[0.08] shadow-2xs"
            />
            <div>
              <h4 className="text-sm font-semibold text-zinc-900 leading-tight">
                {media.author?.nickname || 'Creator'}
              </h4>
              <p className="text-xs text-zinc-400 font-medium mt-0.5">
                @{media.author?.uniqueId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-zinc-500 font-medium">
            <span className="flex items-center gap-1">
              <Heart className="w-3.5 h-3.5 text-zinc-400 stroke-[2.2]" />
              {media.stats.likes ? Number(media.stats.likes).toLocaleString() : '0'}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5 text-zinc-400 stroke-[2.2]" />
              {media.stats.comments ? Number(media.stats.comments).toLocaleString() : '0'}
            </span>
          </div>
        </div>

        {/* Nội dung Caption */}
        {media.title && (
          <p className="text-xs sm:text-[13px] text-zinc-700 leading-relaxed font-normal">
            {media.title}
          </p>
        )}

        {/* Khung Ảnh bìa / Xem trước */}
        <div className="relative w-full aspect-video sm:aspect-21/9 rounded-2xl overflow-hidden bg-zinc-100 border border-black/[0.04] flex items-center justify-center">
          <img
            src={media.cover || (media.images && media.images[0]) || '/logo.svg'}
            alt="Preview"
            className="w-full h-full object-cover"
          />
          {media.mediaType === 'video' && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center text-zinc-900 shadow-md">
                <Play className="w-5 h-5 ml-0.5 fill-current" />
              </div>
            </div>
          )}
        </div>

        {/* Danh sách nút tùy chọn theo cụm Inset Grouped của iOS */}
        <div className="space-y-2 pt-1">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
            {t('downloadOptions')}
          </div>

          <div className="bg-[#F2F2F7] rounded-2xl p-1.5 space-y-1">
            {/* Tải Video HD hoặc Bộ ảnh */}
            {isPhotos ? (
              <button
                type="button"
                onClick={() => onDownloadSingle(media, 'photos_zip')}
                disabled={isDownloading}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-white hover:bg-zinc-50 border border-black/[0.04] shadow-2xs transition active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-800 flex items-center justify-center">
                    <Images className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-semibold text-zinc-900">
                      {t('downloadPhotos')}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {media.images.length} {t('photoUnit')} (ZIP)
                    </div>
                  </div>
                </div>
                <div className="w-7 h-7 rounded-full bg-[#007AFF] text-white flex items-center justify-center shadow-xs">
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onDownloadSingle(media, 'video_hd')}
                disabled={isDownloading}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-white hover:bg-zinc-50 border border-black/[0.04] shadow-2xs transition active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-800 flex items-center justify-center">
                    <Film className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-semibold text-zinc-900">
                      {t('downloadVideoHd')}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      1080p Full HD MP4
                    </div>
                  </div>
                </div>
                <div className="w-7 h-7 rounded-full bg-[#007AFF] text-white flex items-center justify-center shadow-xs">
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
              </button>
            )}

            {/* Tải Audio MP3 */}
            <button
              type="button"
              onClick={() => onDownloadSingle(media, 'audio')}
              disabled={isDownloading}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-white hover:bg-zinc-50 border border-black/[0.04] shadow-2xs transition active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-800 flex items-center justify-center">
                  <Music className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-zinc-900">
                    {t('downloadAudio')}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    320kbps MP3 Audio
                  </div>
                </div>
              </div>
              <div className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center">
                <Download className="w-3.5 h-3.5 stroke-[2.2]" />
              </div>
            </button>
          </div>
        </div>

        {/* Thanh trạng thái tiến trình tải */}
        {downloadProgressText && (
          <div className="p-3 bg-zinc-100 rounded-xl flex items-center justify-center gap-2 text-xs font-medium text-zinc-700 animate-in fade-in">
            <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-[#007AFF] rounded-full animate-spin" />
            <span>{downloadProgressText}</span>
          </div>
        )}

        {/* Các nút phụ ở đáy card */}
        <div className="flex items-center justify-between pt-2 text-xs">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-800 transition"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedLink ? t('copied') : t('copyLink')}</span>
          </button>

          <a
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[#007AFF] hover:underline font-medium"
          >
            <span>{t('openPlatform')}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};

export const MediaResultCardSkeleton: React.FC<{ theme?: string }> = () => (
  <div className="w-full max-w-2xl mx-auto bg-white/70 backdrop-blur-xl rounded-[28px] p-6 border border-black/[0.04] space-y-4 animate-pulse">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-zinc-200" />
      <div className="space-y-1.5">
        <div className="w-28 h-3.5 bg-zinc-200 rounded-md" />
        <div className="w-20 h-2.5 bg-zinc-200 rounded-md" />
      </div>
    </div>
    <div className="w-full aspect-video bg-zinc-200 rounded-2xl" />
    <div className="space-y-2">
      <div className="w-full h-12 bg-zinc-200 rounded-xl" />
      <div className="w-full h-12 bg-zinc-200 rounded-xl" />
    </div>
  </div>
);
