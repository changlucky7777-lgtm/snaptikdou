import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
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
  downloadDirectFile,
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

  // Direct download button state (Vị trí số 4: xuất hiện khi tải thông thường không tải được)
  const [directDownloadInfo, setDirectDownloadInfo] = useState<DirectDownloadInfo | null>(null);

  // Path Configuration (with fallback to legacy key if exists)
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

  // Download state
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [downloadProgressText, setDownloadProgressText] = useState<string>('');
  const downloadSessionRef = React.useRef<DownloadSession | null>(null);

  // Pause active download
  const handlePauseDownload = () => {
    if (downloadSessionRef.current) {
      downloadSessionRef.current.pause();
      setIsPaused(true);
      setDownloadProgressText((prev) => {
        if (!prev) return 'Đã tạm dừng tải';
        return prev.replace(/^Đang tải/i, 'Đã tạm dừng').replace(/^Đang nén/i, 'Đã tạm dừng nén');
      });
    }
  };

  // Resume active download
  const handleResumeDownload = () => {
    if (downloadSessionRef.current) {
      downloadSessionRef.current.resume();
      setIsPaused(false);
      setDownloadProgressText((prev) => {
        if (!prev) return 'Đang tải...';
        return prev.replace(/^Đã tạm dừng nén/i, 'Đang nén').replace(/^Đã tạm dừng/i, 'Đang tải');
      });
    }
  };

  // Cancel active download
  const handleCancelDownload = () => {
    if (downloadSessionRef.current) {
      downloadSessionRef.current.cancel();
    }
    setIsDownloading(false);
    setIsPaused(false);
    setDownloadProgressText('Đã hủy tải về');
    setTimeout(() => {
      setDownloadProgressText('');
    }, 2000);
  };

  // Download History (with fallback to legacy key if exists)
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

  // Persist config
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(pathConfig));
  }, [pathConfig]);

  // Persist history
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  }, [history]);

  // Extract TikTok/Douyin media
  const handleExtract = async (targetUrl?: string) => {
    const queryUrl = targetUrl || url;
    if (!queryUrl || !queryUrl.trim()) return;

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
        throw new Error(data.message || 'Không thể trích xuất video TikTok. Vui lòng kiểm tra lại link.');
      }

      setCurrentMedia(data.data);
      setDirectDownloadInfo(null);
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi khi phân tích URL.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to record history
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

  // Download single item (e.g. video HD, SD, audio, or photos zip) with multi-tier failover
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
          throw new Error('Bài viết này không có video (hoặc là bài viết dạng Album Ảnh).');
        }

        const pathData = buildFilePath(media, pathConfig, {
          mediaType: 'video',
          resolution: type === 'video_hd' ? 'HD' : 'SD',
        });

        const videoUrl = primaryUrl || fallbackUrl;

        // Kích hoạt tải trực tiếp qua trình duyệt (Native Download): trình duyệt tự ghi thẳng xuống đĩa, hỗ trợ resume và không chiếm RAM
        downloadDirectFile(videoUrl, pathData.filename);
        addHistoryRecord(media, pathData.fullPath, type, 'video');
        setDownloadProgressText('Đã bắt đầu tải video qua trình duyệt!');
        setTimeout(() => setDownloadProgressText(''), 3000);
      } else if (type === 'audio') {
        const audioUrl = media.audio?.url || (media.mediaType === 'photos' ? media.video?.noWatermark : '');
        if (!audioUrl) {
          throw new Error('Không tìm thấy đường dẫn tệp âm thanh MP3 của bài viết này.');
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

        // Step 1: Thử tải trực tiếp MP3 từ CDN nguồn trước
        if (audioUrl && !audioUrl.startsWith('/api/')) {
          try {
            blob = await streamFetchBlob(audioUrl, (p) => setDownloadProgressText(p), 20000, undefined, session);
          } catch (cdnErr: any) {
            if (session.isCancelled || cdnErr?.name === 'AbortError') throw cdnErr;
            console.warn('Direct audio CDN fetch failed, falling back to proxy stream:', cdnErr?.message || cdnErr);
          }
        }

        // Step 2: Dự phòng qua VPS Proxy Stream nếu trực tiếp không thành công
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
          setDownloadProgressText('Tải MP3 thành công!');
        } else {
          triggerNativeBrowserDownload(downloadUrl, pathData.filename);
          addHistoryRecord(media, pathData.fullPath, 'audio', 'audio');
        }
      } else if (type === 'photos_zip') {
        const items = media.images.map((imgUrl, idx) => {
          const pathData = buildFilePath(media, pathConfig, { mediaType: 'photos', index: idx + 1 });
          return { url: imgUrl, relativePath: pathData.relativePath };
        });

        // Ưu tiên nén ZIP trực tiếp trên Client (tiết kiệm 100% RAM và CPU trên VPS)
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
          console.warn('Client-side ZIP failed, falling back to server-side bundle:', clientZipErr);
          try {
            setDownloadProgressText('Đang kết nối máy chủ nén bộ ảnh...');
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
          setDownloadProgressText('Tải album ảnh thành công!');
        } else {
          throw new Error('Không thể tạo tệp nén ZIP cho album ảnh.');
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

        // Direct CDN First Strategy: tải ảnh trực tiếp từ CDN nguồn
        if (imgUrl && !imgUrl.startsWith('/api/')) {
          try {
            blob = await streamFetchBlob(imgUrl, (p) => setDownloadProgressText(p), 20000, undefined, session);
          } catch (cdnErr: any) {
            if (session.isCancelled || cdnErr?.name === 'AbortError') throw cdnErr;
            console.warn('Direct photo CDN fetch failed, falling back to proxy stream:', cdnErr?.message || cdnErr);
          }
        }

        // Dự phòng qua proxy VPS nếu trực tiếp không lấy được
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
          setDownloadProgressText(`Tải ảnh ${photoIndex + 1} thành công!`);
        } else {
          triggerNativeBrowserDownload(photoDownloadUrl, pathData.filename);
          addHistoryRecord(media, pathData.fullPath, 'photo_single', 'photos');
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || session.isCancelled) {
        setDownloadProgressText('Đã hủy tải về');
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
      const cleanTitle = (media.title || 'video')
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

  // Handle direct browser download (Vị trí số 4: hiển thị khi tải thông thường không tải được)
  const handleDirectDownload = () => {
    if (!directDownloadInfo?.url) return;
    downloadDirectFile(directDownloadInfo.url, directDownloadInfo.filename);
    if (currentMedia) {
      addHistoryRecord(currentMedia, directDownloadInfo.filename, 'video_hd', 'video');
    }
    setDownloadProgressText('Đã bắt đầu tải xuống tốc độ cao!');
    setTimeout(() => setDownloadProgressText(''), 3000);
  };

  // Re-download from history
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
        
        {/* TAB 1: DOWNLOADER (TẢI VIDEO) */}
        {activeTab === 'download' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            
            {/* Hero / Pitch Banner */}
            {!currentMedia && (
              <div className="text-center max-w-[1200px] mx-auto space-y-3 pt-2">
                <h1 id="hero-heading" className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight w-full max-w-[1200px] mx-auto">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-rose-400">
                    SnapTikDou
                  </span>
                </h1>

                <p id="hero-subtitle" className={`text-[16px] leading-relaxed w-[341px] max-w-full mx-auto ${
                  theme === 'light' ? 'text-slate-600' : 'text-slate-400'
                }`}>
                  Tải Video HD, nhạc Mp3 và ảnh Slide trên TikTok & Douyin không dính Logo
                </p>
              </div>
            )}

            {/* URL Input Bar */}
            <UrlInputBar
              url={url}
              setUrl={setUrl}
              onExtract={handleExtract}
              isLoading={isLoading}
              error={error}
              theme={theme}
            />

            {/* Extracted Media Result Card / Skeleton Loading */}
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

        {/* TAB 2: HISTORY (LỊCH SỬ) */}
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
          {/* Copyright */}
          <div className="flex items-center justify-center md:justify-start">
            <span className={`text-[11px] font-medium tracking-wide ${
              theme === 'light' ? 'text-slate-800' : 'text-white'
            }`}>© 2026 SnapTikDou</span>
          </div>

          {/* Contact & Support Email */}
          <div className="flex items-center justify-center gap-1.5 transition">
            <span className={`text-[11px] ${
              theme === 'light' ? 'text-slate-700' : 'text-[#ffffff] border-[#ffffff]'
            }`}>Email:</span>
            <a
              href="mailto:snaptikdou@gmail.com"
              className={`text-[11px] font-medium underline underline-offset-2 transition ${
                theme === 'light'
                  ? 'text-pink-600 hover:text-pink-700'
                  : 'text-[#ffffff] border-[#ffffff] hover:text-slate-200'
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
