import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { LanguageSelector } from './components/LanguageSelector';
import { UrlInputBar } from './components/UrlInputBar';
import { MediaResultCard, MediaResultCardSkeleton } from './components/MediaResultCard';
import { HistorySection } from './components/HistorySection';
import { TikTokMediaItem, PathConfig, HistoryRecord } from './types';
import { DEFAULT_PATH_CONFIG, buildFilePath } from './utils/pathBuilder';
import {
  streamFetchBlob,
  triggerBlobDownload,
  triggerNativeBrowserDownload,
  downloadBlobSafely,
  createClientZipArchive,
  createDownloadSession,
  DownloadSession,
} from './utils/fileSystem';
import {
  ShieldCheck,
  CheckCircle2,
  Check,
} from 'lucide-react';

const STORAGE_KEY_CONFIG = 'snaptikdou_path_config';
const STORAGE_KEY_HISTORY = 'snaptikdou_history';
const STORAGE_KEY_THEME = 'snaptikdou_theme';

interface DirectDownloadInfo {
  url: string;
  filename: string;
}

export default function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'download' | 'history'>('download');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
      }
    }
    return 'dark';
  });

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const nextTheme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY_THEME, nextTheme);
      return nextTheme;
    });
  };

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
    if (!queryUrl || !queryUrl.trim()) {
      setError(t('errEmptyUrl'));
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
        body: JSON.stringify({ url: queryUrl.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || t('errExtractFailed'));
      }
      setCurrentMedia(data.data);
      setDirectDownloadInfo(null);
    } catch (err: any) {
      if (!navigator.onLine) {
        setError(t('errNetwork'));
      } else {
        setError(t('errExtractFailed'));
      }
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

        setDownloadProgressText(`Đang tải video ${type === 'video_hd' ? 'HD (1080p)' : 'SD'}...`);
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
        const audioUrl = media.audio?.url || (media.mediaType === 'photos' ? media.video?.noWatermark : '');
        if (!audioUrl) {
          throw new Error('Không tìm thấy đường dẫn âm thanh MP3 của bài viết này.');
        }

        const pathData = buildFilePath(media, pathConfig, { mediaType: 'audio' });
        const audioParams = new URLSearchParams({
          url: audioUrl,
          postUrl: media.url,
          mediaType: 'audio',
          filename: pathData.filename,
        });
        const downloadUrl = `/api/tiktok/download?${audioParams.toString()}`;

        setDownloadProgressText('Đang tải âm thanh MP3...');
        let blob: Blob | null = null;

        if (audioUrl && !audioUrl.startsWith('/api/')) {
          try {
            blob = await streamFetchBlob(audioUrl, (p) => setDownloadProgressText(p), 20000, undefined, session);
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
                body: JSON.stringify({
                  url: audioUrl,
                  postUrl: media.url,
                  mediaType: 'audio',
                  filename: pathData.filename,
                }),
              },
              session
            );
          } catch (err: any) {
            if (session.isCancelled || err?.name === 'AbortError') throw err;
            try {
              blob = await streamFetchBlob(downloadUrl, (p) => setDownloadProgressText(p), 30000, undefined, session);
            } catch (err2: any) {
              if (session.isCancelled || err2?.name === 'AbortError') throw err2;
            }
          }
        }

        if (session.isCancelled) return;

        if (blob) {
          await downloadBlobSafely(blob, pathData.filename);
          addHistoryRecord(media, pathData.fullPath, 'audio', 'audio');
          setDownloadProgressText(t('downloadCompleted'));
          setTimeout(() => setDownloadProgressText(''), 3000);
        } else {
          triggerNativeBrowserDownload(downloadUrl, pathData.filename);
          addHistoryRecord(media, pathData.fullPath, 'audio', 'audio');
        }
      } else if (type === 'photos_zip') {
        const items = media.images.map((imgUrl, idx) => {
          const pathData = buildFilePath(media, pathConfig, { mediaType: 'photos', index: idx + 1 });
          return { url: imgUrl, relativePath: pathData.relativePath };
        });

        setDownloadProgressText('Đang nén ảnh trực tiếp trên trình duyệt...');
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
              setDownloadProgressText(`Đang nén ảnh (${percent}%)...`);
            },
            session
          );
        } catch (clientZipErr: any) {
          if (session.isCancelled || clientZipErr?.name === 'AbortError') throw clientZipErr;
          try {
            setDownloadProgressText('Đang nén từ máy chủ...');
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
        setDownloadProgressText(`Đang tải ảnh ${photoIndex + 1}...`);

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

  const handleReDownload = (record: HistoryRecord) => {
    setUrl(record.sourceUrl);
    setActiveTab('download');
    setDirectDownloadInfo(null);
    handleExtract(record.sourceUrl);
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans selection:bg-pink-500 selection:text-white overflow-x-hidden w-full transition-colors duration-200 ${
      theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'
    }`}>
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        historyCount={history.length}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8 min-w-0 overflow-hidden">
        {/* TAB 1: DOWNLOADER */}
        {activeTab === 'download' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {!currentMedia && (
              <div className="text-center max-w-[1200px] mx-auto space-y-3 pt-2">
                <h1 id="hero-heading" className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight w-full max-w-[1200px] mx-auto">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-rose-400">
                    SnapTikDou
                  </span>
                </h1>
                <p id="hero-subtitle" className={`text-[16px] leading-relaxed max-w-2xl mx-auto ${
                  theme === 'light' ? 'text-slate-600' : 'text-slate-400'
                }`}>
                  {t('sloganSub')}
                </p>
              </div>
            )}

            <UrlInputBar
              url={url}
              setUrl={setUrl}
              onExtract={handleExtract}
              isLoading={isLoading}
              error={error}
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
      <footer className={`border-t border-[#988B8B] py-6 text-center text-xs transition-colors duration-200 ${
        theme === 'light' ? 'bg-white text-slate-600' : 'bg-slate-950 text-slate-500'
      }`}>
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center justify-center md:justify-start">
            <span className={`text-[11px] font-medium tracking-wide ${
              theme === 'light' ? 'text-slate-800' : 'text-white'
            }`}>© 2026 SnapTikDou</span>
          </div>

          <div className="flex items-center justify-center gap-1.5 transition">
            <span className={`text-[11px] ${
              theme === 'light' ? 'text-slate-700' : 'text-[#ffffff]'
            }`}>
              {t('footerEmail')}
            </span>
            <a
              href="mailto:snaptikdou@gmail.com"
              className={`text-[11px] font-medium underline underline-offset-2 transition ${
                theme === 'light'
                  ? 'text-pink-600 hover:text-pink-700'
                  : 'text-[#ffffff] hover:text-slate-200'
              }`}
              title="Gửi email hỗ trợ"
            >
              snaptikdou@gmail.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
