import JSZip from 'jszip';
import i18n from '../i18n';

export interface DirectorySaveResult {
  saved: number;
  total: number;
  directoryName: string;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function promptDirectoryPicker(): Promise<any | null> {
  if (!isFileSystemAccessSupported()) {
    return null;
  }
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads',
    });
    return handle;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return null; // User cancelled
    }
    console.warn('Directory picker error:', err);
    return null;
  }
}

// Recursively traverse or create subdirectories from path like "@channel/video"
async function getOrCreateSubdirectoryHandle(
  rootHandle: any,
  subPath: string
): Promise<any> {
  const parts = subPath.split('/').filter(Boolean);
  let currentHandle = rootHandle;

  for (const part of parts) {
    currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
  }
  return currentHandle;
}

// Save a file directly to the user's hard drive using FileSystemAccess API
export async function saveFileToDiskHandle(
  rootHandle: any,
  relativePath: string,
  blob: Blob
): Promise<boolean> {
  try {
    const parts = relativePath.split('/');
    const filename = parts.pop() || 'file';
    const subDir = parts.join('/');

    const dirHandle = subDir
      ? await getOrCreateSubdirectoryHandle(rootHandle, subDir)
      : rootHandle;

    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (err) {
    console.error(`Error saving file ${relativePath} to disk:`, err);
    return false;
  }
}

// Stream-pipe download directly into FileSystemWritableFileStream without keeping large files in JS RAM
export async function streamSaveToDiskHandle(
  rootHandle: any,
  relativePath: string,
  url: string,
  onProgress?: (progressText: string) => void
): Promise<boolean> {
  let fileHandle: any = null;
  let writable: any = null;
  try {
    const parts = relativePath.split('/');
    const filename = parts.pop() || 'file';
    const subDir = parts.join('/');

    const dirHandle = subDir
      ? await getOrCreateSubdirectoryHandle(rootHandle, subDir)
      : rootHandle;

    fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    writable = await fileHandle.createWritable();

    const controller = new AbortController();
    const connectTimer = setTimeout(() => {
      controller.abort(new DOMException('Connection timed out', 'TimeoutError'));
    }, 45000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(connectTimer);

    if (!res.ok) {
      await writable.abort();
      throw new Error(`Máy chủ tải xuống phản hồi mã lỗi: ${res.status}`);
    }

    const expectedLength = Number(res.headers.get('x-content-length') || res.headers.get('content-length') || '0');

    if (!res.body) {
      const blob = await res.blob();
      await writable.write(blob);
      await writable.close();
      return true;
    }

    const reader = res.body.getReader();
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        await writable.write(value);
        received += value.length;
        if (onProgress) {
          const receivedMB = (received / (1024 * 1024)).toFixed(1);
          if (expectedLength > 0) {
            const totalMB = (expectedLength / (1024 * 1024)).toFixed(1);
            const percent = Math.min(100, Math.round((received / expectedLength) * 100));
            onProgress(`Đang lưu vào ổ đĩa: ${receivedMB} MB / ${totalMB} MB (${percent}%)...`);
          } else {
            onProgress(`Đang lưu vào ổ đĩa: ${receivedMB} MB...`);
          }
        }
      }
    }

    await writable.close();
    return true;
  } catch (err) {
    console.error(`Error stream-saving ${relativePath} to disk:`, err);
    if (writable) {
      try {
        await writable.abort();
      } catch {
        // ignore
      }
    }
    return false;
  }
}

// Client-side ZIP generator using JSZip
export async function createClientZipArchive(
  items: Array<{ nameOrPath: string; blobOrUrl: Blob | string; isBlob?: boolean }>,
  onProgress?: (percent: number, currentFile: string) => void,
  session?: DownloadSession | null
): Promise<Blob> {
  const zip = new JSZip();

  let count = 0;
  for (const item of items) {
    if (session?.isCancelled) {
      throw new DOMException('Download cancelled by user', 'AbortError');
    }
    if (session?.isPaused) {
      await session.waitIfPaused();
    }
    const normalizedPath = item.nameOrPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (onProgress) {
      onProgress(Math.round((count / items.length) * 90), normalizedPath);
    }

    if (item.isBlob && item.blobOrUrl instanceof Blob) {
      zip.file(normalizedPath, item.blobOrUrl);
    } else if (typeof item.blobOrUrl === 'string') {
      try {
        let res = await fetch(item.blobOrUrl, {
          signal: session?.abortController.signal,
        });
        if (!res.ok && !item.blobOrUrl.startsWith('/api/')) {
          const proxyUrl = `/api/tiktok/download?url=${encodeURIComponent(item.blobOrUrl)}&filename=${encodeURIComponent(normalizedPath)}`;
          res = await fetch(proxyUrl, { signal: session?.abortController.signal });
        }
        if (res.ok) {
          const blob = await res.blob();
          zip.file(normalizedPath, blob);
        }
      } catch (err: any) {
        if (session?.isCancelled || err?.name === 'AbortError') {
          throw new DOMException('Download cancelled by user', 'AbortError');
        }
        if (!item.blobOrUrl.startsWith('/api/')) {
          try {
            const proxyUrl = `/api/tiktok/download?url=${encodeURIComponent(item.blobOrUrl)}&filename=${encodeURIComponent(normalizedPath)}`;
            const res = await fetch(proxyUrl, { signal: session?.abortController.signal });
            if (res.ok) {
              const blob = await res.blob();
              zip.file(normalizedPath, blob);
            }
          } catch (proxyErr) {
            console.warn(`Failed to fetch for zip: ${item.nameOrPath}`, proxyErr);
          }
        }
      }
    }
    count++;
  }

  if (session?.isCancelled) {
    throw new DOMException('Download cancelled by user', 'AbortError');
  }

  if (onProgress) {
    onProgress(95, 'Đang nén file ZIP...');
  }

  const content = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      if (onProgress) {
        onProgress(Math.round(metadata.percent), 'Đang nén tập tin...');
      }
    }
  );

  return content;
}

// Trigger standard browser download for a Blob
export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) {
      document.body.removeChild(a);
    }
  }, 3000);
  // Keep Object URL alive for at least 1 hour so large files (200MB+)
  // have plenty of time for Chrome / OS to stream from memory buffer to disk
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 3600000);
}

// Trigger native browser download directly via an anchor element
// Hands the media stream directly to the OS / Browser Download Manager (Android notification bar / Safari downloads)
// Enables background downloading that continues even when the user switches to Zalo or turns off the screen.
export function triggerNativeBrowserDownload(url: string, filename: string = 'media.mp4') {
  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  // Determine whether this is a same-origin / internal endpoint
  const isSameOrigin =
    url.startsWith('/') ||
    (typeof window !== 'undefined' && url.startsWith(window.location.origin));

  if (isInsideIframe && !isSameOrigin) {
    // Cross-origin external CDN link can open in new tab safely
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  } else {
    // CRITICAL FIX: For same-origin endpoints (/api/tiktok/download?...),
    // NEVER use target="_blank" with noopener noreferrer inside an iframe!
    // In cloud environments (Google AI Studio / Cloud Run), opening a same-origin URL
    // in a new tab without session cookies causes a 302 Cookie Check redirect.
    // Chrome's download manager then fails with "Site wasn't available" and writes a 0-byte file!
    // Without target="_blank", the browser sends the request within the authenticated session,
    // receives Content-Disposition: attachment, and downloads the file reliably.
    a.target = '_self';
  }

  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) {
      document.body.removeChild(a);
    }
  }, 3000);
}

// Safely save/download a blob across regular tabs, iframe sandboxes, and mobile devices
export async function downloadBlobSafely(
  blob: Blob,
  filename: string
): Promise<boolean> {
  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  // Method 1: File System Access API - showSaveFilePicker (Native OS Save Dialog)
  // Only attempt when not inside an iframe, as cross-origin iframes always throw SecurityError
  if (!isInsideIframe && typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const ext = filename.split('.').pop() || '';
      const mimeType = blob.type || 'application/octet-stream';
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: filename.endsWith('.mp3')
              ? 'Audio MP3'
              : filename.endsWith('.zip')
              ? 'ZIP Archive'
              : filename.endsWith('.jpg') || filename.endsWith('.png')
              ? 'Image'
              : 'Video MP4',
            accept: { [mimeType]: [`.${ext}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (pickerErr: any) {
      if (pickerErr.name === 'AbortError') {
        // User deliberately cancelled the file picker dialog
        return true;
      }
      console.warn('showSaveFilePicker was cancelled or unsupported, falling back to blob download:', pickerErr);
    }
  }

  // Method 2: Rock-solid Blob Object URL download
  // Downloads directly from RAM without making any external network requests,
  // preventing HTTP 302 redirects, authentication mismatches, or "Site wasn't available" errors
  triggerBlobDownload(blob, filename);
  return true;
}

export interface DownloadSession {
  abortController: AbortController;
  isPaused: boolean;
  isCancelled: boolean;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  waitIfPaused: () => Promise<void>;
}

export function createDownloadSession(): DownloadSession {
  let currentController = new AbortController();
  let pauseResolve: (() => void) | null = null;

  const session: DownloadSession = {
    get abortController() {
      return currentController;
    },
    set abortController(c: AbortController) {
      currentController = c;
    },
    isPaused: false,
    isCancelled: false,
    pause() {
      if (session.isCancelled || session.isPaused) return;
      session.isPaused = true;
      try {
        // Ngắt kết nối ngay lập tức: đóng hẳn TCP socket mạng, 0 byte truyền tải thêm
        currentController.abort(new DOMException('Download paused by user', 'PauseAbort'));
      } catch {
        // ignore
      }
    },
    resume() {
      if (!session.isPaused || session.isCancelled) return;
      session.isPaused = false;
      // Tạo controller mới cho lượt fetch tiếp theo
      currentController = new AbortController();
      if (pauseResolve) {
        const r = pauseResolve;
        pauseResolve = null;
        r();
      }
    },
    cancel() {
      session.isCancelled = true;
      session.isPaused = false;
      try {
        currentController.abort(new DOMException('Download cancelled by user', 'AbortError'));
      } catch {
        // ignore
      }
      if (pauseResolve) {
        const r = pauseResolve;
        pauseResolve = null;
        r();
      }
    },
    async waitIfPaused() {
      if (!session.isPaused) return;
      await new Promise<void>((resolve) => {
        pauseResolve = resolve;
      });
      if (session.isCancelled) {
        throw new DOMException('Download cancelled by user', 'AbortError');
      }
    },
  };
  return session;
}

export type StreamProgressCallback = (progressText: string) => void;
export interface StreamProgressOptions {
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

// Fetch media with real-time stream chunking, byte-size checking, network-level pause/resume (Range header), and progress tracking
export async function streamFetchBlob(
  url: string,
  onProgressOrOptions?: StreamProgressCallback | StreamProgressOptions,
  timeoutMs: number = 45000,
  requestInit?: RequestInit,
  session?: DownloadSession | null
): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  let received = 0;
  let totalExpectedLength = 0;
  let finalContentType = '';

  const reportProgress = (currentReceived: number, total: number) => {
    if (!onProgressOrOptions) return;
    if (typeof onProgressOrOptions === 'object' && onProgressOrOptions.onProgress) {
      onProgressOrOptions.onProgress(currentReceived, total);
      return;
    }
    if (typeof onProgressOrOptions === 'function') {
      const receivedMB = (currentReceived / (1024 * 1024)).toFixed(1);
      if (total > 0) {
        const totalMB = (total / (1024 * 1024)).toFixed(1);
        const percent = Math.min(100, Math.round((currentReceived / total) * 100));
        onProgressOrOptions(
          i18n.t('downloadingProgress', {
            loaded: `${receivedMB} MB`,
            total: `${totalMB} MB`,
            percent,
          })
        );
      } else {
        onProgressOrOptions(
          i18n.t('downloadingProgress', {
            loaded: `${receivedMB} MB`,
            total: '... MB',
            percent: 0,
          })
        );
      }
    }
  };

  while (true) {
    if (session?.isCancelled) {
      throw new DOMException('Download cancelled by user', 'AbortError');
    }

    if (session?.isPaused) {
      await session.waitIfPaused();
      if (session?.isCancelled) {
        throw new DOMException('Download cancelled by user', 'AbortError');
      }
    }

    const controller = session ? session.abortController : new AbortController();
    let timer: any = null;
    if (!session) {
      timer = setTimeout(() => {
        controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'));
      }, timeoutMs);
    }

    // Build headers with Range if resuming from a paused state
    const headers: Record<string, string> = {
      ...(requestInit?.headers as Record<string, string> || {}),
    };

    if (received > 0) {
      headers['Range'] = `bytes=${received}-`;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        ...requestInit,
        headers,
        signal: controller.signal,
      });
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      if (session?.isCancelled) {
        throw new DOMException('Download cancelled by user', 'AbortError');
      }
      if (session?.isPaused) {
        // Tạm dừng mạng: chờ người dùng nhấn Tiếp tục (Resume) rồi lặp lại với Range header
        await session.waitIfPaused();
        continue;
      }
      if (err?.name === 'AbortError') {
        throw new DOMException('Download cancelled by user', 'AbortError');
      }
      throw err;
    }

    if (timer) clearTimeout(timer);

    // If server returned 416 (Range Not Satisfiable), file might be already complete
    if (res.status === 416 && received > 0 && totalExpectedLength > 0 && received >= totalExpectedLength) {
      break;
    }

    if (!res.ok && res.status !== 206) {
      let errMsg = `Không thể kết nối máy chủ tải xuống (Mã phản hồi: ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson?.error) {
          errMsg = errJson.error;
        } else if (errJson?.message) {
          errMsg = errJson.message;
        }
      } catch {
        if (res.status === 500) {
          errMsg = 'Máy chủ proxy gặp sự cố kết nối (500). Đang tự động chuyển sang luồng tải thay thế...';
        } else if (res.status === 502 || res.status === 504) {
          errMsg = 'Kết nối tới máy chủ nguồn bị gián đoạn (502/504). Đang thử phương thức dự phòng...';
        }
      }
      throw new Error(errMsg);
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) {
      throw new Error('Máy chủ nguồn phản hồi trang web thay vì tệp phương tiện.');
    }
    if (ct.includes('application/json')) {
      try {
        const errJson = await res.json();
        if (errJson?.error || errJson?.message) {
          throw new Error(errJson.error || errJson.message);
        }
      } catch (parseErr: any) {
        if (parseErr.message && !parseErr.message.includes('JSON')) {
          throw parseErr;
        }
      }
      throw new Error('Máy chủ phản hồi thông báo lỗi thay vì tệp tải về.');
    }
    if (ct && !ct.includes('application/octet-stream')) {
      finalContentType = ct;
    }

    // Determine total length from Content-Range or Content-Length
    const contentRange = res.headers.get('content-range'); // e.g. "bytes 42200000-392573000/392573000"
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)/);
      if (match && Number(match[1]) > 0) {
        totalExpectedLength = Number(match[1]);
      }
    }
    if (!totalExpectedLength) {
      const cl = Number(res.headers.get('x-content-length') || res.headers.get('content-length') || '0');
      if (cl > 0) {
        totalExpectedLength = received > 0 && res.status === 206 ? received + cl : cl;
      }
    }

    // If server responded with 200 (not 206) when we requested a Range, it restarted from byte 0
    if (res.status === 200 && received > 0) {
      chunks.length = 0;
      received = 0;
    }

    if (!res.body) {
      const blob = await res.blob();
      if (blob.size < 64 && received === 0) {
        throw new Error('Tệp tải về bị lỗi hoặc rỗng.');
      }
      const buffer = new Uint8Array(await blob.arrayBuffer());
      chunks.push(buffer);
      received += buffer.length;
      break;
    }

    const reader = res.body.getReader();
    let streamInterruptedByPause = false;

    // Emit initial progress if this is the start
    if (received === 0) {
      reportProgress(0, totalExpectedLength);
    }

    try {
      while (true) {
        if (session?.isCancelled) {
          try { await reader.cancel(); } catch { /* ignore */ }
          throw new DOMException('Download cancelled by user', 'AbortError');
        }

        if (session?.isPaused) {
          streamInterruptedByPause = true;
          try { await reader.cancel(); } catch { /* ignore */ }
          break; // Thoát vòng lặp đọc để ngắt kết nối socket, lượt lặp ngoài sẽ chờ và gửi Range header khi Resume
        }

        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          reportProgress(received, totalExpectedLength);
        }
      }
    } catch (readErr: any) {
      if (session?.isCancelled) {
        try { await reader.cancel(); } catch { /* ignore */ }
        throw new DOMException('Download cancelled by user', 'AbortError');
      }
      if (session?.isPaused) {
        streamInterruptedByPause = true;
      } else if (readErr?.name === 'AbortError') {
        throw new DOMException('Download cancelled by user', 'AbortError');
      } else {
        throw readErr;
      }
    }

    if (streamInterruptedByPause) {
      // Khi tạm dừng: socket đã được ngắt hoàn toàn qua AbortController/reader.cancel()
      // Chờ người dùng nhấn Tiếp tục (Resume) rồi lặp lại để fetch từ byte tiếp theo
      continue;
    }

    // Stream hoàn tất thành công
    break;
  }

  const blob = new Blob(chunks, { type: finalContentType || 'application/octet-stream' });
  if (blob.size < 64) {
    throw new Error('Tệp tải về không hợp lệ (kích thước quá nhỏ hoặc rỗng).');
  }
  return blob;
}

// Tải trực tiếp qua trình duyệt (Native Download)
export function downloadDirectFile(url: string, filename: string) {
  // Đi qua proxy stream của server để chống chặn Referer
  const proxyUrl = `/api/tiktok/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  
  const a = document.createElement('a');
  a.href = proxyUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Nếu là video hoặc tệp dung lượng lớn (> 50MB), kích hoạt tải native của trình duyệt
export function triggerNativeDownload(downloadUrl: string, filename: string) {
  downloadDirectFile(downloadUrl, filename);
}

// Trigger reliable browser download for an external media URL without opening media player
export async function triggerDirectUrlDownload(url: string, filename: string = 'media.mp4') {
  // Fetch via stream proxy with Blob
  const proxyUrl = `/api/tiktok/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  const blob = await streamFetchBlob(proxyUrl);
  triggerBlobDownload(blob, filename);
}
