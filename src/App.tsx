import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Coffee } from 'lucide-react';
import { DonateModal } from './components/DonateModal';
import { LanguageSelector } from './components/LanguageSelector';
import { UrlInputBar } from './components/UrlInputBar';
import { MediaResultCard, MediaResultCardSkeleton } from './components/MediaResultCard';
import { TikTokMediaItem, PathConfig, HistoryRecord } from './types';
import { DEFAULT_PATH_CONFIG, buildFilePath } from './utils/pathBuilder';
import { getInitialLanguage, saveLanguage, SupportedLang } from './i18n';
import {
  streamFetchBlob,
  triggerBlobDownload,
  triggerNativeBrowserDownload,
  downloadBlobSafely,
  createClientZipArchive,
  createDownloadSession,
  DownloadSession,
} from './utils/fileSystem';

const STORAGE_KEY_CONFIG = 'snaptikdou_path_config';
const STORAGE_KEY_HISTORY = 'snaptikdou_history';

interface DirectDownloadInfo {
  url: string;
  filename: string;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<SupportedLang>(() => getInitialLanguage());

  const handleLanguageChange = (newLang: SupportedLang) => {
    setLang(newLang);
    i18n.changeLanguage(newLang);
    saveLanguage(newLang);
  };

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [showDmcaModal, setShowDmcaModal] = useState(false);
  const [isDonateOpen, setIsDonateOpen] = useState(false);
  const theme = 'light';

  const [url, setUrl] = useState('');
  const [currentMedia, setCurrentMedia] = useState<TikTokMediaItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [directDownloadInfo, setDirectDownloadInfo] = useState<DirectDownloadInfo | null>(null);

  const [pathConfig, setPathConfig] = useState<PathConfig>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG) || localStorage.getItem('tik1click_path_config');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return DEFAULT_PATH_CONFIG;
  });

  const [isDownloading, setIsDownloading] = useState(false);
  // State cảnh báo không tắt màn hình cho iOS (giữ cố định không tự tắt)
  const [showIosWarning, setShowIosWarning] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = React.useRef<any>(null);

  // Lưu danh sách media ID đã tải MP3 trong phiên để tránh lặp Toast trên Android
  const downloadedAudioIdsRef = React.useRef<Set<string>>(new Set());

  const statusPollingRef = React.useRef<any>(null);

  const clearStatusPolling = () => {
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current);
      statusPollingRef.current = null;
    }
  };

  const showToast = (message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };
  const [isPaused, setIsPaused] = useState(false);
  const [downloadProgressText, setDownloadProgressText] = useState<string>('');
  const downloadSessionRef = React.useRef<DownloadSession | null>(null);

  const handlePauseDownload = () => {
    if (downloadSessionRef.current) {
      downloadSessionRef.current.pause();
      setIsPaused(true);
      setDownloadProgressText((prev) => {
        if (!prev) return 'Tạm dừng';
        return prev.replace(/^Đang tải/i, 'Tạm dừng').replace(/^Đang nén/i, 'Tạm dừng nén');
      });
    }
  };

  const handleResumeDownload = () => {
    if (downloadSessionRef.current) {
      downloadSessionRef.current.resume();
      setIsPaused(false);
      setDownloadProgressText((prev) => {
        if (!prev) return 'Đang tải...';
        return prev.replace(/^Tạm dừng nén/i, 'Đang nén').replace(/^Tạm dừng/i, 'Đang tải');
      });
    }
  };

  const handleCancelDownload = () => {
    clearStatusPolling();
    if (downloadSessionRef.current) {
      downloadSessionRef.current.cancel();
    }
    setIsDownloading(false);
    setIsPaused(false);
    setShowIosWarning(false); // Tắt cảnh báo khi người dùng chủ động hủy tải
    setDownloadProgressText('Đã hủy tải');
    setTimeout(() => {
      setDownloadProgressText('');
    }, 2000);
  };

  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY) || localStorage.getItem('tik1click_history');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(pathConfig));
  }, [pathConfig]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    return () => {
      clearStatusPolling();
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleExtract = async (targetUrl?: string) => {
    const queryUrl = targetUrl || url;
    const trimmedUrl = (queryUrl || '').trim();

    // 1. Kiểm tra trường hợp chưa dán link (input rỗng)
    if (!trimmedUrl) {
      window.alert(t('alertEmptyLink'));
      return;
    }

    // 2. Kiểm tra liên kết hợp lệ từ TikTok hoặc Douyin
    const isValidUrl = /(tiktok\.com|douyin\.com|iesdouyin\.com)/i.test(trimmedUrl);
    if (!isValidUrl) {
      window.alert(t('alertInvalidLink'));
      return;
    }

    setIsLoading(true);
    setCurrentMedia(null);
    setError(null);
    setDirectDownloadInfo(null);
    clearStatusPolling();
    setShowIosWarning(false); // Reset cảnh báo khi lấy link mới

    try {
      const response = await fetch('/api/tiktok/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || t('errorExtractFailed'));
      }
      setCurrentMedia(data.data);
      setDirectDownloadInfo(null);
    } catch (err: any) {
      const errorMsg = !navigator.onLine ? t('errNetwork') : (err?.message || t('errorExtractFailed'));
      setError(errorMsg);
      window.alert(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const addHistoryRecord = (
    media: TikTokMediaItem,
    savedPath: string,
    downloadType: HistoryRecord['downloadType'],
    mediaType: HistoryRecord['mediaType']
  ) => {
    const newRecord: HistoryRecord = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      mediaId: media.id,
      title: media.title || 'TikTok Media',
      cover: media.cover || '',
      authorUniqueId: media.author.uniqueId,
      authorNickname: media.author.nickname,
      mediaType,
      downloadedAt: new Date().toISOString(),
      savedPath,
      sourceUrl: media.url,
      downloadType,
    };
    setHistory((prev) => [newRecord, ...prev]);
  };

  const handleDownloadSingle = async (
    media: TikTokMediaItem,
    type: 'video_hd' | 'video_sd' | 'audio' | 'photos_zip' | 'photo_single',
    photoIndex?: number
  ) => {
    const session = createDownloadSession();
    downloadSessionRef.current = session;
    setIsDownloading(true);
    setIsPaused(false);
    setDownloadProgressText('Đang kết nối...');
    setDirectDownloadInfo(null);

    try {
      if (type === 'video_hd' || type === 'video_sd') {
        const primaryUrl = type === 'video_hd' ? media.video.hd || media.video.noWatermark : media.video.noWatermark;
        const fallbackUrl = type === 'video_hd' ? media.video.noWatermark : media.video.hd;
        if (!primaryUrl && !fallbackUrl) {
          throw new Error('Bài viết này không có video hợp lệ.');
        }

        const pathData = buildFilePath(media, pathConfig, {
          mediaType: 'video',
          resolution: type === 'video_hd' ? 'HD' : 'SD',
        });

        const initialUrl = primaryUrl || fallbackUrl;
        const backupUrls = media.video.backupUrls || [];
        const downloadPayload = {
          url: initialUrl,
          fallbackUrl: fallbackUrl && fallbackUrl !== initialUrl ? fallbackUrl : '',
          backupUrls,
          postUrl: media.url,
          mediaType: 'video',
          resolution: type === 'video_hd' ? 'hd' : 'sd',
          filename: pathData.filename,
        };

        const downloadParams = new URLSearchParams({
          url: initialUrl,
          fallbackUrl: fallbackUrl || '',
          postUrl: media.url,
          mediaType: 'video',
          resolution: type === 'video_hd' ? 'hd' : 'sd',
          filename: pathData.filename,
        });
        if (backupUrls && backupUrls.length > 0) {
          downloadParams.set('backupUrls', backupUrls.join(','));
        }
        const downloadUrl = `/api/tiktok/download?${downloadParams.toString()}`;

        setDownloadProgressText(t('loadingVideo'));
        let blob: Blob | null = null;

        // Thử tải trực tiếp từ CDN trước để tiết kiệm tài nguyên
        if (initialUrl && !initialUrl.startsWith('/api/')) {
          try {
            blob = await streamFetchBlob(initialUrl, (p) => setDownloadProgressText(p), 20000, undefined, session);
          } catch (cdnErr: any) {
            if (session.isCancelled || cdnErr?.name === 'AbortError') throw cdnErr;
          }
        }

        // Nếu trực tiếp bị chặn thì chạy qua proxy stream của server
        if (!blob) {
          try {
            blob = await streamFetchBlob(
              '/api/tiktok/download',
              (progressText) => setDownloadProgressText(progressText),
              45000,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(downloadPayload),
              },
              session
            );
          } catch (err: any) {
            if (session.isCancelled || err?.name === 'AbortError') throw err;
            try {
              blob = await streamFetchBlob(downloadUrl, (p) => setDownloadProgressText(p), 45000, undefined, session);
            } catch (err2: any) {
              if (session.isCancelled || err2?.name === 'AbortError') throw err2;
            }
          }
        }

        if (session.isCancelled) return;

        if (blob) {
          await downloadBlobSafely(blob, pathData.filename);
          addHistoryRecord(media, pathData.fullPath, type, 'video');
          setDownloadProgressText(t('downloadCompleted'));
          setTimeout(() => setDownloadProgressText(''), 3000);
        } else {
          triggerNativeBrowserDownload(downloadUrl, pathData.filename);
          addHistoryRecord(media, pathData.fullPath, type, 'video');
        }
      } else if (type === 'audio') {
        const audioUrl = media.audio?.url || '';
        const isPhotoSlide = media.mediaType === 'photos';
        const videoFallbackUrl = isPhotoSlide ? '' : (media.video?.hd || media.video?.noWatermark || '');
        if (!audioUrl && !videoFallbackUrl) {
          throw new Error('Không tìm thấy nguồn âm thanh hoặc video để tải MP3.');
        }

        const isIOS = typeof navigator !== 'undefined' && (
          /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        );
        const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

        // Sinh token mới cho mỗi phiên tải
        const token = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        // Luôn reset cảnh báo cũ trước khi kích hoạt phiên tải mới
        setShowIosWarning(false);
        clearStatusPolling();

        if (isIOS) {
          // ==========================================
          // NHÁNH RIÊNG DÀNH CHO IOS
          // ==========================================
          // 1. Chỉ hiện Toast chuẩn bị, KHÔNG set downloadProgressText ngay
          setDownloadProgressText('');
          showToast(t('toastPreparingDownloadIOS'));

          // 2. Chạy Polling lắng nghe sự kiện: người dùng ấn "Tải về" trên popup của iOS
          statusPollingRef.current = setInterval(async () => {
            try {
              const res = await fetch(`/api/tiktok/check-status?token=${token}`);
              const data = await res.json();
              if (data) {
                // CHỈ KHI NGƯỜI DÙNG ĐÃ NHẤN "TẢI VỀ" TRÊN POPUP SAFARI:
                if (data.isActive) {
                  setToastMessage(null); // Tắt Toast đen
                  setShowIosWarning(true); // Bật khung cảnh báo màu cam
                } else if (!data.isActive && !data.isCompleted) {
                  // Người dùng ấn X hoặc hủy tải trên popup Safari
                  setShowIosWarning(false);
                }

                // Khi tải hoàn tất 100%:
                if (data.isCompleted) {
                  setShowIosWarning(false);
                  setDownloadProgressText(t('downloadCompleted'));
                  clearStatusPolling();
                  setTimeout(() => setDownloadProgressText(''), 3000);
                }
              }
            } catch {
              // Bỏ qua lỗi tạm thời khi polling
            }
          }, 600);

          setTimeout(() => clearStatusPolling(), 15 * 60 * 1000);

        } else if (isAndroid) {
          // ==========================================
          // NHÁNH DÀNH CHO ANDROID (GIỮ NGUYÊN VẸN)
          // ==========================================
          const mediaKey = media.id || media.url;
          const hasDownloadedBefore = downloadedAudioIdsRef.current.has(mediaKey);
          if (!hasDownloadedBefore) {
            showToast(t('toastDownloadingAndroid'));
            downloadedAudioIdsRef.current.add(mediaKey);
          }
          setDownloadProgressText(t('downloadCompleted'));
          setTimeout(() => setDownloadProgressText(''), 2500);

        } else {
          // ==========================================
          // NHÁNH DÀNH CHO DESKTOP (GIỮ NGUYÊN VẸN)
          // ==========================================
          setDownloadProgressText(t('downloadCompleted'));
          setTimeout(() => setDownloadProgressText(''), 2500);
        }

        const pathData = buildFilePath(media, pathConfig, { mediaType: 'audio' });
        const audioParams = new URLSearchParams({
          url: audioUrl,
          fallbackUrl: audioUrl,
          videoFallback: videoFallbackUrl,
          downloadToken: token,
          postUrl: media.url,
          mediaType: 'audio',
          filename: pathData.filename,
        });
        const downloadUrl = `/api/tiktok/download?${audioParams.toString()}`;
        
        triggerNativeBrowserDownload(downloadUrl, pathData.filename);
        addHistoryRecord(media, pathData.fullPath, 'audio', 'audio');
      } else if (type === 'photos_zip') {
        const items = media.images.map((imgUrl, idx) => {
          const pathData = buildFilePath(media, pathConfig, { mediaType: 'photos', index: idx + 1 });
          return { url: imgUrl, relativePath: pathData.relativePath };
        });

        setDownloadProgressText(t('compressingPhotos'));
        let zipBlob: Blob | null = null;

        try {
          const zipItems = items.map((it) => ({
            nameOrPath: it.relativePath,
            blobOrUrl: it.url,
            isBlob: false,
          }));
          zipBlob = await createClientZipArchive(
            zipItems,
            (percent) => {
              setDownloadProgressText(`${t('compressingPhotos')} (${percent}%)`);
            },
            session
          );
        } catch (clientZipErr: any) {
          if (session.isCancelled || clientZipErr?.name === 'AbortError') throw clientZipErr;
          try {
            setDownloadProgressText(t('compressingPhotos'));
            const zipRes = await fetch('/api/tiktok/bundle-zip', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items,
                zipName: `@${media.author.uniqueId}_photo_slides.zip`,
              }),
              signal: session.abortController.signal,
            });
            if (zipRes.ok) {
              zipBlob = await zipRes.blob();
            }
          } catch (serverErr: any) {
            if (session.isCancelled || serverErr?.name === 'AbortError') throw serverErr;
          }
        }

        if (session.isCancelled) return;

        if (zipBlob) {
          await downloadBlobSafely(zipBlob, `@${media.author.uniqueId}_photo_slides.zip`);
          addHistoryRecord(media, `@${media.author.uniqueId}/photos/ (${items.length} ảnh)`, 'photos_zip', 'photos');
          setDownloadProgressText(t('downloadCompleted'));
          setTimeout(() => setDownloadProgressText(''), 3000);
        } else {
          throw new Error('Không thể nén ZIP cho album ảnh.');
        }
      } else if (type === 'photo_single' && typeof photoIndex === 'number' && media.images?.[photoIndex]) {
        const imgUrl = media.images[photoIndex];
        const pathData = buildFilePath(media, pathConfig, { mediaType: 'photos', index: photoIndex + 1 });
        setDownloadProgressText(t('downloadingPhoto'));

        let blob: Blob | null = null;
        const photoPayload = {
          url: imgUrl,
          postUrl: media.url,
          mediaType: 'photos',
          filename: pathData.filename,
        };
        const photoParams = new URLSearchParams({
          url: imgUrl,
          postUrl: media.url,
          mediaType: 'photos',
          filename: pathData.filename,
        });
        const photoDownloadUrl = `/api/tiktok/download?${photoParams.toString()}`;

        if (imgUrl && !imgUrl.startsWith('/api/')) {
          try {
            blob = await streamFetchBlob(imgUrl, (p) => setDownloadProgressText(p), 20000, undefined, session);
          } catch (cdnErr: any) {
            if (session.isCancelled || cdnErr?.name === 'AbortError') throw cdnErr;
          }
        }

        if (!blob) {
          try {
            blob = await streamFetchBlob(
              '/api/tiktok/download',
              (progressText) => setDownloadProgressText(progressText),
              30000,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(photoPayload),
              },
              session
            );
          } catch (err: any) {
            if (session.isCancelled || err?.name === 'AbortError') throw err;
            try {
              blob = await streamFetchBlob(photoDownloadUrl, (p) => setDownloadProgressText(p), 30000, undefined, session);
            } catch (err2: any) {
              if (session.isCancelled || err2?.name === 'AbortError') throw err2;
            }
          }
        }

        if (session.isCancelled) return;

        if (blob) {
          await downloadBlobSafely(blob, pathData.filename);
          addHistoryRecord(media, pathData.fullPath, 'photo_single', 'photos');
          setDownloadProgressText(t('downloadCompleted'));
          setTimeout(() => setDownloadProgressText(''), 3000);
        } else {
          triggerNativeBrowserDownload(photoDownloadUrl, pathData.filename);
          addHistoryRecord(media, pathData.fullPath, 'photo_single', 'photos');
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || session.isCancelled) {
        setDownloadProgressText('Đã hủy');
        setTimeout(() => setDownloadProgressText(''), 2000);
        return;
      }

      console.error('Download single error:', err);
      const fallbackUrl =
        type === 'video_hd'
          ? media.video.hd || media.video.noWatermark
          : type === 'video_sd'
          ? media.video.noWatermark || media.video.hd
          : type === 'audio'
          ? media.audio?.url
          : undefined;

      const directUrl = fallbackUrl || media.video.hd || media.video.noWatermark || media.url;
      const cleanTitle =
        (media.title || 'video')
          .replace(/[^\w\s\u4e00-\u9fa5\u00C0-\u1EF9_-]/gi, '')
          .trim()
          .slice(0, 40) || media.id || 'download';
      const ext = type === 'audio' ? 'mp3' : 'mp4';

      setDirectDownloadInfo({
        url: directUrl,
        filename: `${cleanTitle}.${ext}`,
      });
    } finally {
      setIsDownloading(false);
      setIsPaused(false);
      downloadSessionRef.current = null;
    }
  };

  const handleDirectDownload = async () => {
    if (!directDownloadInfo?.url) return;
    const session = createDownloadSession();
    downloadSessionRef.current = session;
    try {
      setIsDownloading(true);
      setIsPaused(false);
      setDownloadProgressText('Đang tải tốc độ cao...');
      const blob = await streamFetchBlob(directDownloadInfo.url, (p) => setDownloadProgressText(p), 45000, undefined, session);
      if (session.isCancelled) return;
      await downloadBlobSafely(blob, directDownloadInfo.filename);
      if (currentMedia) {
        addHistoryRecord(currentMedia, directDownloadInfo.filename, 'video_hd', 'video');
      }
      setDownloadProgressText(t('downloadCompleted'));
    } catch (err: any) {
      if (err?.name === 'AbortError' || session.isCancelled) {
        setDownloadProgressText('Đã hủy');
        setTimeout(() => setDownloadProgressText(''), 2000);
        return;
      }
      triggerNativeBrowserDownload(directDownloadInfo.url, directDownloadInfo.filename);
      if (currentMedia) {
        addHistoryRecord(currentMedia, directDownloadInfo.filename, 'video_hd', 'video');
      }
    } finally {
      setIsDownloading(false);
      setIsPaused(false);
      downloadSessionRef.current = null;
      setTimeout(() => setDownloadProgressText(''), 2500);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-[#007AFF] selection:text-white overflow-x-hidden w-full bg-[#F2F2F7] text-[#1C1C1E]">
      {/* Header chuẩn Safari Glassmorphism */}
      <header className="fixed top-0 left-0 right-0 z-40 w-full bg-white/80 backdrop-blur-xl border-b border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-3 sm:px-6 py-2.5">
          {/* Cụm Logo */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer select-none shrink-0"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <img 
              src="/logo.svg" 
              alt="SnapTikDou Logo" 
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain" 
            />
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-bold tracking-tight text-[#1C1C1E] leading-none">
                SnapTikDou
              </span>
              <span className="text-[11px] font-normal text-[#8E8E93] hidden sm:inline">
                {t('sloganSub')}
              </span>
            </div>
          </div>

          {/* Cụm chức năng bên phải */}
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSelector onLanguageChange={handleLanguageChange} />
            
            {/* Nút Ủng hộ dạng Pill xám mờ iOS */}
            <button
              type="button"
              onClick={() => setIsDonateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E5E5EA] hover:bg-[#D1D1D6] text-[#1C1C1E] text-xs font-semibold active:scale-[0.96] transition-all cursor-pointer"
              title={t('donateTitle')}
            >
              <Coffee className="w-3.5 h-3.5 text-[#1C1C1E]" />
              <span className="hidden sm:inline">{t('donateBtn')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-20 pb-8 space-y-6 min-w-0">
        <div className="space-y-8 animate-in fade-in duration-200">
          {!currentMedia && (
            <div className="text-center max-w-[1200px] mx-auto space-y-2 pt-4">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#1C1C1E]">
                SnapTikDou
              </h1>
              <p className="text-sm sm:text-base text-[#8E8E93] max-w-xl mx-auto leading-relaxed">
                {t('sloganSub')}
              </p>
            </div>
          )}

          <UrlInputBar
            url={url}
            setUrl={setUrl}
            onExtract={handleExtract}
            isLoading={isLoading}
            theme={theme}
          />

          {isLoading ? (
            <MediaResultCardSkeleton theme={theme} />
          ) : currentMedia ? (
            <MediaResultCard
              media={currentMedia}
              onDownloadSingle={handleDownloadSingle}
              isDownloading={isDownloading}
              isPaused={isPaused}
              onPauseDownload={handlePauseDownload}
              onResumeDownload={handleResumeDownload}
              onCancelDownload={handleCancelDownload}
              downloadProgressText={downloadProgressText}
              directDownloadInfo={directDownloadInfo}
              onDirectDownload={handleDirectDownload}
              showIosWarning={showIosWarning}
              theme={theme}
            />
          ) : null}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white mt-16 pt-12 pb-8 px-4 text-slate-600">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="SnapTikDou" className="w-7 h-7 object-contain" />
              <span className="text-lg font-bold text-slate-900 tracking-wider uppercase">SnapTikDou</span>
            </div>
            <p style={{ color: '#000000' }} className="text-xs leading-relaxed max-w-sm">
              {t('sloganSub')}
            </p>
            <div className="text-xs text-slate-500 pt-1">
              <span style={{ color: '#000000' }}>Email: </span>
              <a href="mailto:snaptikdou@gmail.com" className="text-slate-800 hover:text-pink-600 font-medium hover:underline">
                snaptikdou@gmail.com
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              {t('footerSocial')}
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="https://facebook.com" target="_blank" rel="noreferrer" className="hover:text-pink-600 transition">
                  Facebook
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              {t('footerLegal')}
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button 
                  onClick={() => setShowTermsModal(true)} 
                  className="hover:text-pink-600 transition-colors text-left"
                >
                  {t('termsOfService')}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setShowPrivacyModal(true)} 
                  className="hover:text-pink-600 transition-colors text-left"
                >
                  {t('privacyPolicy')}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setShowCookieModal(true)} 
                  className="hover:text-pink-600 transition-colors text-left"
                >
                  {t('cookiePolicy')}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setShowDisclaimerModal(true)} 
                  className="hover:text-pink-600 transition-colors text-left"
                >
                  {t('disclaimerTitle')}
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setShowDmcaModal(true)} 
                  className="hover:text-pink-600 transition-colors text-left"
                >
                  DMCA
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-5xl mx-auto pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">
            © 2026 <strong className="text-slate-700 font-semibold">SnapTikDou</strong>. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Modal Điều khoản sử dụng */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Nút đóng */}
            <button 
              onClick={() => setShowTermsModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Tiêu đề & Giới thiệu */}
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo.svg" alt="SnapTikDou Logo" className="w-6 h-6 object-contain" />
              <h3 className="text-lg font-bold text-slate-900">
                {t('termsContent.title')}
              </h3>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              {t('termsContent.intro')}
            </p>

            {/* Các điều khoản chi tiết */}
            <div className="space-y-3.5 text-xs max-h-72 overflow-y-auto pr-2 border-y border-slate-100 py-3">
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('termsContent.sec1_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('termsContent.sec1_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('termsContent.sec2_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('termsContent.sec2_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('termsContent.sec3_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('termsContent.sec3_desc')}</p>
              </div>
            </div>

            {/* Nút đóng dưới cùng */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowTermsModal(false)}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-medium text-xs rounded-xl shadow-xs transition"
              >
                {t('btnClose')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal Chính sách bảo mật */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Nút đóng */}
            <button 
              onClick={() => setShowPrivacyModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Tiêu đề & Giới thiệu */}
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo.svg" alt="SnapTikDou Logo" className="w-6 h-6 object-contain" />
              <h3 className="text-lg font-bold text-slate-900">
                {t('privacyContent.title')}
              </h3>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              {t('privacyContent.intro')}
            </p>

            {/* Nội dung chính sách */}
            <div className="space-y-3.5 text-xs max-h-72 overflow-y-auto pr-2 border-y border-slate-100 py-3">
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('privacyContent.sec1_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('privacyContent.sec1_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('privacyContent.sec2_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('privacyContent.sec2_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('privacyContent.sec3_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('privacyContent.sec3_desc')}</p>
              </div>
            </div>

            {/* Nút đóng chân modal */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-medium text-xs rounded-xl shadow-xs transition"
              >
                {t('btnClose')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal Chính sách Cookie */}
      {showCookieModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Nút đóng */}
            <button 
              onClick={() => setShowCookieModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Tiêu đề & Giới thiệu */}
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo.svg" alt="SnapTikDou Logo" className="w-6 h-6 object-contain" />
              <h3 className="text-lg font-bold text-slate-900">
                {t('cookieContent.title')}
              </h3>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              {t('cookieContent.intro')}
            </p>

            {/* Nội dung chính sách */}
            <div className="space-y-3.5 text-xs max-h-72 overflow-y-auto pr-2 border-y border-slate-100 py-3">
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('cookieContent.sec1_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('cookieContent.sec1_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('cookieContent.sec2_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('cookieContent.sec2_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('cookieContent.sec3_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('cookieContent.sec3_desc')}</p>
              </div>
            </div>

            {/* Nút đóng chân modal */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowCookieModal(false)}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-medium text-xs rounded-xl shadow-xs transition"
              >
                {t('btnClose')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal Miễn trừ trách nhiệm */}
      {showDisclaimerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Nút đóng */}
            <button 
              onClick={() => setShowDisclaimerModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Tiêu đề & Giới thiệu */}
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo.svg" alt="SnapTikDou Logo" className="w-6 h-6 object-contain" />
              <h3 className="text-lg font-bold text-slate-900">
                {t('disclaimerContent.title')}
              </h3>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              {t('disclaimerContent.intro')}
            </p>

            {/* Nội dung chi tiết */}
            <div className="space-y-3.5 text-xs max-h-72 overflow-y-auto pr-2 border-y border-slate-100 py-3">
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('disclaimerContent.sec1_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('disclaimerContent.sec1_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('disclaimerContent.sec2_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('disclaimerContent.sec2_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('disclaimerContent.sec3_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('disclaimerContent.sec3_desc')}</p>
              </div>
            </div>

            {/* Nút đóng chân modal */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowDisclaimerModal(false)}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-medium text-xs rounded-xl shadow-xs transition"
              >
                {t('btnClose')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal DMCA */}
      {showDmcaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Nút đóng */}
            <button 
              onClick={() => setShowDmcaModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Tiêu đề & Giới thiệu */}
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo.svg" alt="SnapTikDou Logo" className="w-6 h-6 object-contain" />
              <h3 className="text-lg font-bold text-slate-900">
                {t('dmcaContent.title')}
              </h3>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              {t('dmcaContent.intro')}
            </p>

            {/* Nội dung chi tiết */}
            <div className="space-y-3.5 text-xs max-h-72 overflow-y-auto pr-2 border-y border-slate-100 py-3">
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('dmcaContent.sec1_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('dmcaContent.sec1_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('dmcaContent.sec2_title')}</h4>
                <p className="text-slate-600 leading-relaxed">
                  {t('dmcaContent.sec2_desc')}{' '}
                  <a href="mailto:snaptikdou@gmail.com" className="text-pink-600 font-medium underline">
                    snaptikdou@gmail.com
                  </a>.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">{t('dmcaContent.sec3_title')}</h4>
                <p className="text-slate-600 leading-relaxed">{t('dmcaContent.sec3_desc')}</p>
              </div>
            </div>

            {/* Nút đóng chân modal */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowDmcaModal(false)}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-medium text-xs rounded-xl shadow-xs transition"
              >
                {t('btnClose')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Toast thông báo nổi 5 giây cho iOS và Android */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white text-xs sm:text-sm font-medium shadow-2xl border border-slate-700/80 backdrop-blur-md flex items-center gap-2.5 max-w-[90vw] animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-none">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="leading-snug text-center">{toastMessage}</span>
        </div>
      )}

      {/* Modal Donate */}
      <DonateModal isOpen={isDonateOpen} onClose={() => setIsDonateOpen(false)} />
    </div>
  );
}
