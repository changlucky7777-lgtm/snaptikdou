import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './components/LanguageSelector';
import { UrlInputBar } from './components/UrlInputBar';
import { MediaResultCard, MediaResultCardSkeleton } from './components/MediaResultCard';
import { HistorySection } from './components/HistorySection';
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
  isIOSDevice,
} from './utils/fileSystem';

const STORAGE_KEY_CONFIG = 'snaptikdou_path_config';
const STORAGE_KEY_HISTORY = 'snaptikdou_history';

interface DirectDownloadInfo {
  url: string;
  filename: string;
}

export interface AudioProgressState {
  currentMB: string;
  totalMB: string;
  percent: number;
  isPaused: boolean;
  isIOS: boolean;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<SupportedLang>(() => getInitialLanguage());

  const handleLanguageChange = (newLang: SupportedLang) => {
    setLang(newLang);
    i18n.changeLanguage(newLang);
    saveLanguage(newLang);
  };

  const [activeTab, setActiveTab] = useState<'download' | 'history'>('download');
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [showDmcaModal, setShowDmcaModal] = useState(false);
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
  const [isPaused, setIsPaused] = useState(false);
  const [downloadProgressText, setDownloadProgressText] = useState<string>('');
  const downloadSessionRef = React.useRef<DownloadSession | null>(null);

  const [audioProgress, setAudioProgress] = useState<AudioProgressState | null>(null);
  const audioSessionRef = React.useRef<{
    url: string;
    filename: string;
    media: TikTokMediaItem;
    pathData: { fullPath: string; filename: string; relativePath: string };
    receivedBytes: number;
    totalBytes: number;
    chunks: Uint8Array[];
    abortController: AbortController | null;
  } | null>(null);

  const startOrResumeAudioFetch = async () => {
    const session = audioSessionRef.current;
    if (!session) return;

    const controller = new AbortController();
    session.abortController = controller;

    try {
      const headers: Record<string, string> = {};
      if (session.receivedBytes > 0) {
        headers['Range'] = `bytes=${session.receivedBytes}-`;
      }

      const res = await fetch(session.url, {
        signal: controller.signal,
        headers,
      });

      if (!res.ok && res.status !== 206) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const contentLenHeader = res.headers.get('content-length');
      if (contentLenHeader && !session.totalBytes) {
        const len = parseInt(contentLenHeader, 10);
        if (len > 0) session.totalBytes = len;
      }

      if (!res.body) {
        const blob = await res.blob();
        await downloadBlobSafely(blob, session.filename);
        addHistoryRecord(session.media, session.pathData.fullPath, 'audio', 'audio');
        setAudioProgress((prev) => (prev ? { ...prev, percent: 100, isPaused: false } : null));
        setTimeout(() => {
          setAudioProgress(null);
          setIsDownloading(false);
          audioSessionRef.current = null;
        }, 1500);
        return;
      }

      const reader = res.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          session.chunks.push(value);
          session.receivedBytes += value.length;

          const currentMB = (session.receivedBytes / (1024 * 1024)).toFixed(1);
          const totalMBText =
            session.totalBytes > 0 ? (session.totalBytes / (1024 * 1024)).toFixed(1) : '...';
          const percent =
            session.totalBytes > 0
              ? Math.min(99, Math.round((session.receivedBytes / session.totalBytes) * 100))
              : Math.min(95, Math.round(session.receivedBytes / 50000));

          setAudioProgress({
            currentMB,
            totalMB: totalMBText,
            percent,
            isPaused: false,
            isIOS: false,
          });
        }
      }

      const blob = new Blob(session.chunks, { type: 'audio/mpeg' });
      await downloadBlobSafely(blob, session.filename);
      addHistoryRecord(session.media, session.pathData.fullPath, 'audio', 'audio');

      const finalMB = (session.receivedBytes / (1024 * 1024)).toFixed(1);
      setAudioProgress({
        currentMB: finalMB,
        totalMB: finalMB,
        percent: 100,
        isPaused: false,
        isIOS: false,
      });

      setTimeout(() => {
        setAudioProgress(null);
        setIsDownloading(false);
        audioSessionRef.current = null;
      }, 1500);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      console.error('Audio fetch stream error, fallback native download:', err);
      triggerNativeBrowserDownload(session.url, session.filename);
      addHistoryRecord(session.media, session.pathData.fullPath, 'audio', 'audio');
      setAudioProgress(null);
      setIsDownloading(false);
      audioSessionRef.current = null;
    }
  };

  const handleTogglePauseAudio = () => {
    if (!audioSessionRef.current) return;
    if (audioProgress?.isPaused) {
      setAudioProgress((prev) => (prev ? { ...prev, isPaused: false } : null));
      startOrResumeAudioFetch();
    } else {
      if (audioSessionRef.current.abortController) {
        audioSessionRef.current.abortController.abort();
      }
      setAudioProgress((prev) => (prev ? { ...prev, isPaused: true } : null));
    }
  };

  const handleCancelAudioDownload = () => {
    if (audioSessionRef.current?.abortController) {
      audioSessionRef.current.abortController.abort();
    }
    audioSessionRef.current = null;
    setAudioProgress(null);
    setIsDownloading(false);
    setDownloadProgressText('Đã hủy tải');
    setTimeout(() => setDownloadProgressText(''), 2000);
  };

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
    if (downloadSessionRef.current) {
      downloadSessionRef.current.cancel();
    }
    setIsDownloading(false);
    setIsPaused(false);
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
        const pathData = buildFilePath(media, pathConfig, { mediaType: 'audio' });

        const rawAudioUrl = media.audio?.url;
        const videoUrl = media.video.hd || media.video.noWatermark;

        let downloadUrl = '';
        // Kiểm tra xem link audio có phải là link stream nhạc độc lập hợp lệ hay không
        const hasValidAudioStream =
          rawAudioUrl &&
          rawAudioUrl.startsWith('http') &&
          rawAudioUrl !== videoUrl &&
          !rawAudioUrl.includes('.mp4');

        if (hasValidAudioStream) {
          // Luồng proxy trực tiếp từ CDN âm thanh Douyin/TikTok (0% CPU)
          const downloadParams = new URLSearchParams({
            url: rawAudioUrl,
            filename: pathData.filename,
            mediaType: 'audio',
          });
          downloadUrl = `/api/tiktok/download?${downloadParams.toString()}`;
        } else {
          // Bắt buộc trích xuất âm thanh qua FFmpeg với cờ -vn để đảm bảo 100% là MP3 (không lẫn hình MP4)
          const source = videoUrl || rawAudioUrl;
          downloadUrl = `/api/tiktok/stream-audio?url=${encodeURIComponent(source)}&filename=${encodeURIComponent(pathData.filename)}`;
        }

        // =========================================================================
        // 1. DÀNH CHO iOS (IPHONE/IPAD): DÙNG LUỒNG NATIVE TRÌNH DUYỆT HOÀN TOÀN
        // Khắc phục triệt để lỗi "Không thể thực hiện tác vụ" khi thoát màn hình.
        // =========================================================================
        if (isIOSDevice()) {
          setDownloadProgressText(t('loadingAudio') || 'Đang kết nối tải audio...');
          triggerNativeBrowserDownload(downloadUrl, pathData.filename);
          addHistoryRecord(media, pathData.fullPath, 'audio', 'audio');

          // Tắt loading sau 1.2s, bàn giao hoàn toàn cho Download Manager của iOS
          setTimeout(() => {
            setDownloadProgressText('');
            setIsDownloading(false);
          }, 1200);
          return;
        }

        // =========================================================================
        // 2. DÀNH CHO ANDROID & DESKTOP: GIỮ NGUYÊN STREAM FETCH VÀ THANH TIẾN TRÌNH %
        // =========================================================================
        const durationSec = Number(media.duration || 0);
        const estimatedTotalBytes = durationSec > 0 ? durationSec * 16000 : 0;

        audioSessionRef.current = {
          url: downloadUrl,
          filename: pathData.filename,
          media,
          pathData,
          receivedBytes: 0,
          totalBytes: estimatedTotalBytes,
          chunks: [],
          abortController: null,
        };

        const totalMBText =
          estimatedTotalBytes > 0
            ? (estimatedTotalBytes / (1024 * 1024)).toFixed(1)
            : '...';

        setAudioProgress({
          currentMB: '0.0',
          totalMB: totalMBText,
          percent: 0,
          isPaused: false,
          isIOS: false,
        });

        startOrResumeAudioFetch();
        return;
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

      const cleanTitle =
        (media.title || 'media')
          .replace(/[^\w\s\u4e00-\u9fa5\u00C0-\u1EF9_-]/gi, '')
          .trim()
          .slice(0, 40) || media.id || 'download';

      let directUrl = '';
      const ext = type === 'audio' ? 'mp3' : 'mp4';

      if (type === 'audio') {
        const rawAudioUrl = media.audio?.url;
        const videoUrl = media.video.hd || media.video.noWatermark;

        // Nếu có link audio độc lập và không phải đuôi mp4
        if (
          rawAudioUrl &&
          rawAudioUrl.startsWith('http') &&
          rawAudioUrl !== videoUrl &&
          !rawAudioUrl.includes('.mp4')
        ) {
          // Tải proxy link audio gốc (nhẹ nhất, không qua convert)
          directUrl = `/api/tiktok/download?url=${encodeURIComponent(rawAudioUrl)}&filename=${encodeURIComponent(cleanTitle + '.mp3')}&mediaType=audio`;
        } else {
          // Tách âm thanh từ video qua ffmpeg
          const source = videoUrl || rawAudioUrl || media.url;
          directUrl = `/api/tiktok/stream-audio?url=${encodeURIComponent(source)}&filename=${encodeURIComponent(cleanTitle + '.mp3')}`;
        }
      } else {
        const fallbackUrl =
          type === 'video_hd'
            ? media.video.hd || media.video.noWatermark
            : media.video.noWatermark || media.video.hd;
        const initialUrl = fallbackUrl || media.video.hd || media.video.noWatermark;
        directUrl = `/api/tiktok/download?url=${encodeURIComponent(initialUrl)}&filename=${encodeURIComponent(cleanTitle + '.mp4')}&mediaType=video`;
      }

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

    try {
      setIsDownloading(true);
      setDownloadProgressText('Đang tải tốc độ cao...');

      // Kích hoạt luồng tải tệp trực tiếp của trình duyệt (Native Download)
      // Giúp file được tải trực tiếp về máy mà không bị giới hạn bộ nhớ RAM hay rỗng file
      triggerNativeBrowserDownload(directDownloadInfo.url, directDownloadInfo.filename);

      if (currentMedia) {
        const isAudio = directDownloadInfo.filename.endsWith('.mp3');
        addHistoryRecord(
          currentMedia,
          directDownloadInfo.filename,
          isAudio ? 'audio' : 'video_hd',
          isAudio ? 'audio' : 'video'
        );
      }

      setDownloadProgressText(t('downloadCompleted'));
    } catch (err: any) {
      console.error('Direct download error:', err);
      triggerNativeBrowserDownload(directDownloadInfo.url, directDownloadInfo.filename);
    } finally {
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgressText('');
      }, 1500);
    }
  };

  const handleReDownload = (record: HistoryRecord) => {
    setUrl(record.sourceUrl);
    setActiveTab('download');
    setDirectDownloadInfo(null);
    handleExtract(record.sourceUrl);
  };

  const historyCount = history.length;

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-pink-500 selection:text-white overflow-x-hidden w-full bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3">
          
          {/* Cụm Logo & Tên nền tảng */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer select-none shrink-0" 
            onClick={() => setActiveTab('download')}
          >
            <img 
              src="/logo.svg" 
              alt="SnapTikDou Logo" 
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain drop-shadow-xs" 
            />
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 leading-none">
                SnapTikDou
              </span>
              <span style={{ color: '#000000' }} className="text-[11px] font-normal hidden sm:inline">
                {t('sloganSub')}
              </span>
            </div>
          </div>

          {/* Cụm chức năng bên phải */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Nút Tab: Tải Video */}
            <button
              onClick={() => setActiveTab('download')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'download'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title={t('tabDownload')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="hidden md:inline">{t('tabDownload')}</span>
            </button>

            {/* Nút Tab: Lịch Sử */}
            <button
              onClick={() => setActiveTab('history')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 relative ${
                activeTab === 'history'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title={t('tabHistory')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden md:inline">{t('tabHistory')}</span>
              {historyCount > 0 && (
                <span className="bg-pink-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {historyCount}
                </span>
              )}
            </button>

            {/* Nút: Chọn Ngôn Ngữ */}
            <LanguageSelector onLanguageChange={handleLanguageChange} />

            {/* Nút: Mở Tab Mới (Dùng để kiểm tra giao diện) */}
            <button
              onClick={() => window.open(window.location.href, '_blank')}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-medium transition flex items-center gap-1.5 shadow-2xs shrink-0"
              title={t('btnOpenNewTab')}
            >
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span className="hidden sm:inline">{t('btnOpenNewTab')}</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8 min-w-0 overflow-hidden">
        {/* TAB 1: DOWNLOADER */}
        {activeTab === 'download' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {!currentMedia && (
              <div className="text-center max-w-[1200px] mx-auto space-y-3 pt-2">
                <h1 id="hero-heading" className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight w-full max-w-[1200px] mx-auto">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-600 via-rose-500 to-pink-500">
                    SnapTikDou
                  </span>
                </h1>
                <p id="hero-subtitle" style={{ color: '#000000' }} className="text-[16px] leading-relaxed max-w-2xl mx-auto">
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
                theme={theme}
                audioProgress={audioProgress}
                onTogglePauseAudio={handleTogglePauseAudio}
                onCancelAudioDownload={handleCancelAudioDownload}
              />
            ) : null}
          </div>
        )}

        {/* TAB 2: HISTORY */}
        {activeTab === 'history' && (
          <HistorySection
            records={history}
            onClearHistory={() => setHistory([])}
            onReDownload={handleReDownload}
            theme={theme}
          />
        )}
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
              <span>Email: </span>
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
    </div>
  );
}
