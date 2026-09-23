import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createServer as createViteServer } from 'vite';
import JSZip from 'jszip';
import ffmpeg from 'fluent-ffmpeg';
import { GoogleGenAI } from '@google/genai';
import {
  TIKTOK_USER_AGENT,
  DOUYIN_USER_AGENT,
  extractCleanUrl,
  extractTikTokId,
  isDouyinUrl,
  isTikTokUrl,
  normalizeMediaUrl,
} from './src/server/constants';
import { fetchWithConnectTimeout, isValidMediaResponse } from './src/server/network';
import { getTtwid } from './src/server/ttwidManager';
import { resolveFinalUrl, extractFromDouyin } from './src/server/services/douyinService';
import { extractFromTikTok } from './src/server/services/tiktokService';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Quản lý phiên tải hoạt động
interface ActiveDownloadSession {
  isActive: boolean;
  isCompleted: boolean;
  lastActive: number;
}
const activeDownloadSessions = new Map<string, ActiveDownloadSession>();

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of activeDownloadSessions.entries()) {
    if (now - session.lastActive > 15 * 60 * 1000) {
      activeDownloadSessions.delete(token);
    }
  }
}, 5 * 60 * 1000);

function setSessionActive(token?: string, isActive: boolean = true) {
  if (!token) return;
  const session = activeDownloadSessions.get(token) || {
    isActive: false,
    isCompleted: false,
    lastActive: Date.now(),
  };
  session.isActive = isActive;
  session.lastActive = Date.now();
  activeDownloadSessions.set(token, session);
}

function setSessionCompleted(token?: string) {
  if (!token) return;
  activeDownloadSessions.set(token, {
    isActive: false,
    isCompleted: true,
    lastActive: Date.now(),
  });
}

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Gemini AI
let genAiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY_MISSING');
  if (!genAiClient) {
    genAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  return genAiClient;
}

function resolveGeminiModel(requestedModel?: string, taskTier?: string): string {
  if (requestedModel) {
    const clean = requestedModel.replace(/^models\//, '');
    const valid = ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    if (valid.includes(clean)) return clean;
  }
  if (taskTier === 'complex') return 'gemini-3.1-pro-preview';
  if (taskTier === 'fast') return 'gemini-3.1-flash-lite';
  return 'gemini-3.5-flash';
}

app.post('/api/gemini/chat', async (req: Request, res: Response) => {
  try {
    const { messages, model, taskTier, systemInstruction } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ success: false, error: 'Messages list is required' });
      return;
    }
    const selectedModel = resolveGeminiModel(model, taskTier);
    const ai = getGeminiClient();
    const contents = messages.map((m: any) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : String(m.content || '') }],
    }));
    const config: any = {};
    if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()) {
      config.systemInstruction = systemInstruction.trim();
    }
    const response = await ai.models.generateContent({ model: selectedModel, contents, config });
    res.json({ success: true, text: response.text || '', modelUsed: selectedModel });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    res.status(500).json({ success: false, error: errMsg });
  }
});

// Endpoint Extract TikTok / Douyin
app.post('/api/tiktok/extract', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, message: 'Vui lòng cung cấp link TikTok hoặc Douyin hợp lệ' });
      return;
    }
    const trimmedUrl = url.trim();
    const cleanTargetUrl = extractCleanUrl(trimmedUrl);
    const isDouyin = isDouyinUrl(cleanTargetUrl) || isDouyinUrl(trimmedUrl);
    const isTikTok = isTikTokUrl(cleanTargetUrl) || isTikTokUrl(trimmedUrl);

    if (!isDouyin && !isTikTok) {
      res.status(400).json({ success: false, message: 'URL không thuộc TikTok hoặc Douyin' });
      return;
    }

    const resolvedUrl = await resolveFinalUrl(cleanTargetUrl || trimmedUrl);
    const targetIsDouyin = isDouyinUrl(resolvedUrl) || isDouyinUrl(cleanTargetUrl) || isDouyinUrl(trimmedUrl);

    if (targetIsDouyin) {
      const douyinData = await extractFromDouyin(cleanTargetUrl || trimmedUrl, resolvedUrl);
      if (douyinData && (douyinData.video?.noWatermark || douyinData.images?.length > 0)) {
        return res.json({ success: true, data: douyinData });
      }
      return res.status(422).json({
        success: false,
        message: 'Không thể trích xuất video/bài viết Douyin. Vui lòng thử lại sau vài giây.',
      });
    }

    const tiktokId = extractTikTokId(resolvedUrl) || extractTikTokId(trimmedUrl);
    const tiktokData = await extractFromTikTok(resolvedUrl, tiktokId);
    return res.json({ success: true, data: tiktokData });
  } catch (error: any) {
    const msg = error?.message || 'Lỗi khi trích xuất thông tin media. Vui lòng kiểm tra lại link.';
    res.status(422).json({ success: false, error: msg, message: msg });
  }
});

// Fetch media with retry
async function fetchMediaWithRetry(
  targetUrl: string,
  options: { isDouyin: boolean; range?: string }
): Promise<globalThis.Response | null> {
  const url = normalizeMediaUrl(targetUrl);
  if (!url) return null;
  const userAgent = options.isDouyin ? DOUYIN_USER_AGENT : TIKTOK_USER_AGENT;
  const referer = options.isDouyin ? 'https://www.douyin.com/' : 'https://www.tiktok.com/';
  let cookieHeader = '';
  if (options.isDouyin) {
    try {
      const ttwid = await getTtwid();
      if (ttwid) cookieHeader = `ttwid=${ttwid};`;
    } catch {}
  }
  const candidateUrls: string[] = [url];
  if (options.isDouyin) {
    if (url.includes('playwm')) {
      const sanitized = url.replace('/playwm/', '/play/').replace(/playwm/g, 'play');
      if (!candidateUrls.includes(sanitized)) candidateUrls.push(sanitized);
    }
  }
  const CONNECT_TIMEOUT = 8000;
  for (const candidate of candidateUrls) {
    const isCdnUrl = /douyinvod\.com|zjcdn\.com|byteimg\.com|snssdk\.com|ixigua\.com|pstatp\.com/i.test(candidate);
    const candidateCookie = isCdnUrl ? '' : cookieHeader;

    try {
      const headers: Record<string, string> = { 'User-Agent': userAgent, Accept: '*/*' };
      if (!isCdnUrl) headers['Referer'] = referer;
      if (candidateCookie) headers['Cookie'] = candidateCookie;
      if (options.range) headers['Range'] = options.range;

      const res = await fetchWithConnectTimeout(candidate, { method: 'GET', headers, redirect: 'follow' }, CONNECT_TIMEOUT);
      if (isValidMediaResponse(res)) return res;
    } catch {}
  }
  return null;
}

// Transcode video stream to mp3 via FFmpeg
function transcodeVideoToMp3Stream(videoUrl: string, res: Response, filename: string, downloadToken?: string) {
  const baseName = filename.replace(/\.(mp3|mp4|m4a|aac)$/i, '');
  const finalFilename = `${baseName}.mp3`;
  const safeFilename = finalFilename.replace(/[^\x20-\x7E]/g, '').replace(/["\\;]/g, '').trim() || 'audio.mp3';
  const encodedFilename = encodeURIComponent(finalFilename);
  const isDouyin = /douyin|byteimg|zjcdn|ixigua/i.test(videoUrl);
  const userAgent = isDouyin ? DOUYIN_USER_AGENT : TIKTOK_USER_AGENT;
  const referer = isDouyin ? 'https://www.douyin.com/' : 'https://www.tiktok.com/';
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ffmpegHeaders = `User-Agent: ${userAgent}\r\nReferer: ${referer}\r\n`;
  const command = ffmpeg()
    .input(videoUrl)
    .inputOptions(['-headers', ffmpegHeaders, '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'])
    .noVideo()
    .audioCodec('copy')
    .format('adts');
  setSessionActive(downloadToken, true);
  command.on('end', () => setSessionCompleted(downloadToken));
  command.on('error', (_err) => {
    setSessionActive(downloadToken, false);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Lỗi trích xuất audio' });
    else if (!res.writableEnded) res.end();
  });
  res.on('close', () => {
    try { command.kill('SIGKILL'); } catch {}
    if (!res.writableEnded) setSessionActive(downloadToken, false);
  });
  command.pipe(res, { end: true });
}

app.get('/api/tiktok/check-status', (req: Request, res: Response) => {
  const token = (req.query.token as string) || '';
  if (token && activeDownloadSessions.has(token)) {
    const session = activeDownloadSessions.get(token)!;
    return res.json({ isActive: session.isActive, isCompleted: session.isCompleted });
  }
  return res.json({ isActive: false, isCompleted: false });
});

app.all('/api/tiktok/download', async (req: Request, res: Response) => {
  try {
    const rawUrl = ((req.query.url || req.body?.url) as string) || '';
    const fallbackUrl = ((req.query.fallbackUrl || req.body?.fallbackUrl) as string) || '';
    const postUrl = ((req.query.postUrl || req.body?.postUrl) as string) || '';
    const videoFallback = ((req.query.videoFallback || req.body?.videoFallback) as string) || '';
    const downloadToken = ((req.query.downloadToken || req.body?.downloadToken) as string) || '';
    const requestedFilename = ((req.query.filename || req.body?.filename) as string) || 'media.mp4';
    const isMp3Request = requestedFilename.endsWith('.mp3') || requestedFilename.endsWith('.m4a') || req.query.mediaType === 'audio' || req.body?.mediaType === 'audio';

    const checkIsDouyin = (u: string) =>
      Boolean(u) &&
      (isDouyinUrl(u) || /zjcdn\.com|douyinvod\.com|byteimg\.com|douyin\.com|snssdk\.com|ixigua\.com/i.test(u));

    if (isMp3Request) {
      const directAudioUrl = rawUrl || fallbackUrl;
      if (directAudioUrl) {
        const isDouyinAudio = checkIsDouyin(directAudioUrl) || checkIsDouyin(postUrl);
        const audioResponse = await fetchMediaWithRetry(directAudioUrl, { isDouyin: isDouyinAudio });
        if (isValidMediaResponse(audioResponse) && audioResponse?.body) {
          const safeFilename = requestedFilename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\;]/g, '_').trim() || 'audio.mp3';
          const encodedFilename = encodeURIComponent(requestedFilename);
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`);
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Accept-Ranges', 'bytes');
          const upstreamLength = audioResponse.headers.get('content-length');
          if (upstreamLength) res.setHeader('Content-Length', upstreamLength);

          setSessionActive(downloadToken, true);
          res.on('close', () => { if (!res.writableEnded) setSessionActive(downloadToken, false); });
          const streamToPipe = typeof (audioResponse.body as any)?.getReader === 'function'
            ? Readable.fromWeb(audioResponse.body as any)
            : audioResponse.body;
          await pipeline(streamToPipe as any, res);
          setSessionCompleted(downloadToken);
          return;
        }
      }
      if (videoFallback) {
        return transcodeVideoToMp3Stream(videoFallback, res, requestedFilename, downloadToken);
      }
    }

    const isDouyin = checkIsDouyin(rawUrl || '') || checkIsDouyin(postUrl || '');
    const requestedRange = req.headers.range as string | undefined;
    let mediaResponse = await fetchMediaWithRetry(rawUrl || fallbackUrl, { isDouyin, range: requestedRange });

    if (!isValidMediaResponse(mediaResponse) || !mediaResponse?.body) {
      res.status(502).json({ success: false, error: 'Máy chủ nguồn tạm thời chặn luồng tải.' });
      return;
    }

    const safeFilename = requestedFilename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\;]/g, '_').trim() || 'media.mp4';
    const encodedFilename = encodeURIComponent(requestedFilename);
    res.setHeader('Content-Type', requestedFilename.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');

    const streamToPipe = typeof (mediaResponse.body as any)?.getReader === 'function'
      ? Readable.fromWeb(mediaResponse.body as any)
      : mediaResponse.body;
    await pipeline(streamToPipe as any, res);
  } catch (err: any) {
    if (!res.headersSent) res.status(502).json({ success: false, error: 'Lỗi tải xuống tập tin' });
    else if (!res.writableEnded) res.end();
  }
});

// Đóng gói ZIP Album ảnh
app.post('/api/tiktok/bundle-zip', async (req: Request, res: Response) => {
  try {
    const { items, zipName } = req.body as { items: Array<{ url: string; relativePath: string }>; zipName?: string };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'Danh sách rỗng' });
      return;
    }
    const zip = new JSZip();
    const finalZipName = (zipName || 'snaptikdou_bundle.zip').replace(/[^\w\d_.-]/gi, '_');

    await Promise.all(
      items.map(async (item) => {
        try {
          const fetchRes = await fetchMediaWithRetry(item.url, { isDouyin: isDouyinUrl(item.url) });
          if (fetchRes && fetchRes.ok) {
            const buffer = await fetchRes.arrayBuffer();
            zip.file(item.relativePath.replace(/^\/+/, ''), buffer);
          }
        } catch {}
      })
    );

    const zipContent = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${finalZipName}"`);
    res.setHeader('Content-Length', zipContent.length.toString());
    res.send(zipContent);
  } catch (error: any) {
    res.status(422).json({ success: false, error: error?.message || 'Lỗi đóng gói ZIP' });
  }
});

// Khởi chạy server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`SnapTikDou server running on http://0.0.0.0:${PORT}`));
}

startServer();
