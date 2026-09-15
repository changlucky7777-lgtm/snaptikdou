import express, { Request, Response } from 'express';
import path from 'path';
import zlib from 'zlib';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createServer as createViteServer } from 'vite';
import JSZip from 'jszip';
import { SocksProxyAgent } from 'socks-proxy-agent';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- CẤU HÌNH TRẠM TRUNG CHUYỂN RENDER SINGAPORE CHO DOUYIN ---
const RENDER_RELAY_URL = 'https://douyin-proxy-render.onrender.com/api/fetch';
const RENDER_AUTH_TOKEN = 'k8dF92mZx2026Secure';

async function fetchViaRender(targetUrl: string, fetchOptions: any = {}) {
  const response = await fetch(RENDER_RELAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': RENDER_AUTH_TOKEN,
    },
    body: JSON.stringify({
      url: targetUrl,
      options: fetchOptions,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Render relay HTTP error: ${response.status}`);
  }

  const result = (await response.json()) as any;
  return result.data;
}

// Standard User-Agents to prevent CDN blocks
const TIKTOK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DOUYIN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DOUYIN_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';
const TIKTOK_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';

// Cloudflare WARP SOCKS5 Proxy Configuration
const WARP_SOCKS_URL = process.env.WARP_PROXY || 'socks5h://127.0.0.1:40000';
let warpAgent: SocksProxyAgent | null = null;
try {
  warpAgent = new SocksProxyAgent(WARP_SOCKS_URL);
} catch (e) {
  warpAgent = null;
}

interface SmartFetchOptions {
  method?: string;
  headers?: Record<string, string> | any;
  body?: any;
  redirect?: 'follow' | 'manual' | 'error';
  signal?: any;
  timeout?: number;
  useProxy?: boolean;
}

// Normalized Smart Response Object
class SmartResponse {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  private _res: any;

  constructor(res: any, url: string) {
    this._res = res;
    this.ok = res.ok;
    this.status = res.status;
    this.statusText = res.statusText || '';
    this.url = res.url || url;
  }

  get headers() {
    const rawHeaders = this._res.headers;
    return {
      get: (name: string): string | null => {
        if (typeof rawHeaders?.get === 'function') {
          return rawHeaders.get(name);
        }
        return rawHeaders?.[name.toLowerCase()] || null;
      },
      getSetCookie: (): string[] => {
        if (typeof rawHeaders?.getSetCookie === 'function') {
          return rawHeaders.getSetCookie();
        }
        if (typeof rawHeaders?.raw === 'function') {
          return rawHeaders.raw()['set-cookie'] || [];
        }
        const single = typeof rawHeaders?.get === 'function' ? rawHeaders.get('set-cookie') : rawHeaders?.['set-cookie'];
        return single ? [single] : [];
      },
    };
  }

  async text(): Promise<string> {
    return this._res.text();
  }

  async json(): Promise<any> {
    return this._res.json();
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (typeof this._res.arrayBuffer === 'function') {
      return this._res.arrayBuffer();
    }
    const buf = await this._res.buffer();
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  get body(): any {
    return this._res.body;
  }
}

// Multi-Tier Fetcher: Try Cloudflare WARP SOCKS5 first, then Direct Node fetch
async function smartFetch(url: string, options: SmartFetchOptions = {}): Promise<SmartResponse> {
  const { useProxy = true, timeout = 10000, ...fetchOpts } = options;

  // Tier 1: Try via WARP SOCKS5 Agent if available
  if (useProxy && warpAgent) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await (fetch as any)(url, {
        ...fetchOpts,
        dispatcher: warpAgent,
        agent: warpAgent,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return new SmartResponse(res, url);
    } catch {
      // If WARP proxy is unavailable or rejected, proceed immediately to Direct Fetch
    }
  }

  // Tier 2: Direct Fetch
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await (fetch as any)(url, {
      ...fetchOpts,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return new SmartResponse(res, url);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Helper to normalize relative or protocol-relative media URLs
function normalizeMediaUrl(url: string | undefined | null, defaultDomain = 'https://www.tikwm.com'): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) {
    return 'https:' + trimmed;
  }
  if (trimmed.startsWith('/')) {
    const isDouyin = trimmed.includes('aweme') || trimmed.includes('douyin') || defaultDomain.includes('douyin');
    const domain = isDouyin ? 'https://www.douyin.com' : defaultDomain;
    return domain.replace(/\/+$/, '') + trimmed;
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    const isDouyin = trimmed.includes('aweme') || trimmed.includes('douyin') || defaultDomain.includes('douyin');
    const domain = isDouyin ? 'https://www.douyin.com' : defaultDomain;
    return domain.replace(/\/+$/, '') + '/' + trimmed;
  }
  return trimmed;
}

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'SnapTikDou',
    version: '1.2.0',
    capabilities: ['tiktok', 'douyin', 'photos', 'audio', 'video_hd', 'batch_zip'],
    timestamp: new Date().toISOString(),
  });
});

// Platform detection helpers
function isDouyinUrl(url: string): boolean {
  return /douyin\.com|iesdouyin\.com/i.test(url);
}

function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
}

// Extract clean URL from raw user input text
function extractCleanUrl(rawInput: string): string {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const trimmed = rawInput.trim();
  // Match standard http/https URLs up to whitespace, quotes, or chinese punctuation
  const match = trimmed.match(/https?:\/\/[^\s"'<>\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+/i);
  if (match && match[0]) {
    return match[0].replace(/[.,;:!?)\]}]+$/, '');
  }
  return trimmed;
}

// Extract Douyin item ID from various URL patterns
function extractDouyinId(urlOrText: string): string | null {
  if (!urlOrText || typeof urlOrText !== 'string') return null;
  const patterns = [
    /(?:video|note|share\/video)\/(\d{15,25})/i,
    /[?&]modal_id=(\d{15,25})/i,
    /[?&]item_ids?=(\d{15,25})/i,
    /aweme_id=(\d{15,25})/i,
    /(\d{19})/,
  ];
  for (const p of patterns) {
    const m = urlOrText.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

// Extract TikTok video or photo ID from various URL patterns
function extractTikTokId(urlOrText: string): string | null {
  if (!urlOrText || typeof urlOrText !== 'string') return null;
  const patterns = [
    /(?:video|photo|v|embed)\/(\d{15,25})/i,
    /[?&](?:item_id|share_item_id|shareId)=(\d{15,25})/i,
    /aweme_id=(\d{15,25})/i,
    /\/(\d{17,21})(?:\.html|\?|\/|$)/,
  ];
  for (const p of patterns) {
    const m = urlOrText.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

// Dynamic TTWID Token with in-memory caching
let cachedTtwid = '';
let cachedTtwidTime = 0;

async function getTtwid(): Promise<string> {
  // 6 hours cache validity
  if (cachedTtwid && Date.now() - cachedTtwidTime < 6 * 3600 * 1000) {
    return cachedTtwid;
  }
  try {
    const res = await smartFetch('https://ttwid.bytedance.com/ttwid/union/register/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': DOUYIN_USER_AGENT,
      },
      body: JSON.stringify({
        region: 'cn',
        aid: 1768,
        needFid: false,
        service: 'www.ixigua.com',
        migrate_info: { ticket: '', source: 'node' },
        cbUrlProtocol: 'https',
        union: true,
      }),
      timeout: 8000,
    });
    const setCookie = res.headers.getSetCookie?.()?.[0] || res.headers.get('set-cookie') || '';
    const match = setCookie.match(/ttwid=([^;]+)/);
    if (match && match[1]) {
      cachedTtwid = match[1];
      cachedTtwidTime = Date.now();
      return cachedTtwid;
    }
  } catch (err) {
    console.warn('Failed to register ttwid cookie:', err);
  }
  return cachedTtwid;
}

// Helper to resolve shortlinks (vt.tiktok.com, vm.tiktok.com, v.douyin.com)
async function resolveFinalUrl(rawUrl: string): Promise<string> {
  let currentUrl = extractCleanUrl(rawUrl);

  // If URL already contains a valid ID, avoid redundant redirects
  if (extractDouyinId(currentUrl) || extractTikTokId(currentUrl)) {
    return currentUrl;
  }

  const isDouyin = isDouyinUrl(currentUrl);
  const ttwid = isDouyin ? await getTtwid() : '';

  // Follow up to 8 redirects to capture ultimate URL and query parameters
  for (let i = 0; i < 8; i++) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': isDouyin ? DOUYIN_MOBILE_USER_AGENT : TIKTOK_MOBILE_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': isDouyin ? 'zh-CN,zh;q=0.9,en;q=0.8' : 'en-US,en;q=0.9',
      };
      if (isDouyin && ttwid) {
        headers['Cookie'] = `ttwid=${ttwid};`;
      }

      const res = await smartFetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers,
        timeout: 6000,
      });

      const location = res.headers.get('location');
      if (location && (res.status >= 300 && res.status < 400)) {
        if (location.startsWith('http')) {
          currentUrl = location;
        } else {
          currentUrl = new URL(location, currentUrl).toString();
        }
        // If we found a direct video ID in location, we can stop early
        if (extractDouyinId(currentUrl) || extractTikTokId(currentUrl)) {
          return currentUrl;
        }
      } else {
        return res.url || currentUrl;
      }
    } catch {
      break;
    }
  }
  return currentUrl;
}

// Formatter to standardize Douyin aweme detail into app payload
function formatDouyinAweme(aweme: any, targetUrl: string, awemeId: string) {
  // Determine media type (video vs photo slide / note)
  const isPhotos = Array.isArray(aweme.images) && aweme.images.length > 0;
  const mediaType: 'video' | 'photos' = isPhotos ? 'photos' : 'video';

  // Extract photos
  const images: string[] = [];
  if (isPhotos) {
    for (const img of aweme.images) {
      const bestUrl = img.url_list?.[0] || img.download_url_list?.[0];
      if (bestUrl) {
        images.push(bestUrl);
      }
    }
  }

  // Helper to inspect Douyin stream url_list and prioritize direct CDN URLs over the 2-minute capped play redirector
  const pickBestDouyinStreamUrl = (urlList: string[] | undefined | null): {
    primary: string;
    directCdn: string;
    sanitizedPlay: string;
    allUrls: string[];
  } => {
    if (!Array.isArray(urlList) || urlList.length === 0) {
      return { primary: '', directCdn: '', sanitizedPlay: '', allUrls: [] };
    }

    const allUrls: string[] = [];
    let directCdn = '';
    for (const u of urlList) {
      if (!u || typeof u !== 'string') continue;
      const trimmed = u.trim();
      if (!trimmed) continue;
      if (!allUrls.includes(trimmed)) allUrls.push(trimmed);
      // CRITICAL: Direct CDN URLs contain the FULL duration without the 2-minute trial limit enforced by /play/ endpoint
      if (!directCdn && /douyinvod\.com|zjcdn\.com|byteimg\.com|snssdk\.com\/video\/tos|ixigua\.com/i.test(trimmed)) {
        directCdn = trimmed;
      }
    }

    // Sanitized play endpoint (replace playwm with play)
    const rawPlayUrl = urlList.find((u) => u && (u.includes('playwm') || u.includes('/play/'))) || urlList[0] || '';
    const sanitizedPlay = rawPlayUrl ? rawPlayUrl.replace('/playwm/', '/play/').replace(/playwm/g, 'play') : '';
    if (sanitizedPlay && !allUrls.includes(sanitizedPlay)) {
      allUrls.push(sanitizedPlay);
    }

    // If a direct CDN URL exists, it is the most reliable for long videos (> 2 min)
    const primary = directCdn || sanitizedPlay || urlList[0] || '';

    return { primary, directCdn, sanitizedPlay, allUrls };
  };

  // Extract video streams (HD 1080p, Standard SD, Watermark, Backup URLs)
  let noWatermarkVideo = '';
  let hdVideo = '';
  let watermarkVideo = '';
  let videoSize = 0;
  let hdVideoSize = 0;
  const backupUrls: string[] = [];

  const addBackup = (u: string | undefined | null) => {
    if (u && typeof u === 'string') {
      const trimmed = u.trim();
      if (trimmed && !backupUrls.includes(trimmed)) {
        backupUrls.push(trimmed);
      }
    }
  };

  if (aweme.video) {
    // 1. Check bit_rate list for highest quality streams
    if (Array.isArray(aweme.video.bit_rate) && aweme.video.bit_rate.length > 0) {
      // Find bitrates sorted descending
      const sorted = [...aweme.video.bit_rate].sort(
        (a: any, b: any) => (b.bit_rate || 0) - (a.bit_rate || 0)
      );

      // Highest bitrate (HD 1080p / 720p)
      const topBitrate = sorted[0];
      if (topBitrate?.play_addr?.url_list) {
        const picked = pickBestDouyinStreamUrl(topBitrate.play_addr.url_list);
        hdVideo = picked.primary;
        hdVideoSize = topBitrate.play_addr.data_size || 0;
        watermarkVideo = topBitrate.play_addr.url_list[0] || '';
        picked.allUrls.forEach(addBackup);
      }

      // Standard SD bitrate (720p or 540p or normal gear)
      const normalBitrate = sorted.find((b: any) =>
        b.gear_name?.includes('720') || b.gear_name?.includes('540')
      ) || (sorted.length > 1 ? sorted[sorted.length - 1] : sorted[0]);

      if (normalBitrate?.play_addr?.url_list) {
        const picked = pickBestDouyinStreamUrl(normalBitrate.play_addr.url_list);
        noWatermarkVideo = picked.primary;
        videoSize = normalBitrate.play_addr.data_size || 0;
        picked.allUrls.forEach(addBackup);
      }

      // Collect all bitrates' URLs as potential backups
      for (const b of sorted) {
        if (b.play_addr?.url_list) {
          b.play_addr.url_list.forEach(addBackup);
        }
        if (b.play_addr_265?.url_list) {
          b.play_addr_265.url_list.forEach(addBackup);
        }
      }
    }

    // 2. Also check aweme.video.play_addr_h264 (H.264 standard streams)
    if (aweme.video.play_addr_h264?.url_list) {
      const picked = pickBestDouyinStreamUrl(aweme.video.play_addr_h264.url_list);
      if (!noWatermarkVideo) {
        noWatermarkVideo = picked.primary;
        videoSize = aweme.video.play_addr_h264.data_size || 0;
      }
      picked.allUrls.forEach(addBackup);
    }

    // 3. Check aweme.video.play_addr
    if (aweme.video.play_addr?.url_list) {
      const picked = pickBestDouyinStreamUrl(aweme.video.play_addr.url_list);
      if (!noWatermarkVideo) {
        noWatermarkVideo = picked.primary;
        videoSize = aweme.video.play_addr.data_size || 0;
      }
      picked.allUrls.forEach(addBackup);
    }

    // 4. Download addr (Douyin full length official download URL)
    if (aweme.video.download_addr?.url_list) {
      if (!watermarkVideo) {
        watermarkVideo = aweme.video.download_addr.url_list[0];
      }
      aweme.video.download_addr.url_list.forEach(addBackup);
    }

    if (!watermarkVideo && aweme.video.play_addr?.url_list?.[0]) {
      watermarkVideo = aweme.video.play_addr.url_list[0];
    }

    if (!hdVideo) {
      hdVideo = noWatermarkVideo;
      hdVideoSize = videoSize;
    }
    if (!noWatermarkVideo) {
      noWatermarkVideo = hdVideo;
      videoSize = hdVideoSize;
    }
  }

  // Extract audio
  const audioUrl = aweme.music?.play_url?.url_list?.[0] || '';
  const audioTitle = aweme.music?.title || 'Douyin Audio';
  const audioAuthor = aweme.music?.author || aweme.author?.nickname || 'Douyin Creator';
  const audioDuration = aweme.music?.duration || 0;

  // Cover image
  const coverUrl =
    aweme.video?.origin_cover?.url_list?.[0] ||
    aweme.video?.cover?.url_list?.[0] ||
    aweme.video?.dynamic_cover?.url_list?.[0] ||
    images[0] ||
    '';

  // Duration (Douyin provides ms for video duration)
  const durationSec = aweme.video?.duration ? Math.round(aweme.video.duration / 1000) : 0;

  return {
    id: String(aweme.aweme_id || awemeId),
    url: targetUrl,
    title: aweme.desc || 'Douyin Media',
    mediaType,
    cover: coverUrl,
    duration: durationSec,
    createdAt: aweme.create_time ? new Date(aweme.create_time * 1000).toISOString() : new Date().toISOString(),
    author: {
      id: String(aweme.author?.uid || aweme.author?.sec_uid || ''),
      uniqueId: aweme.author?.unique_id || aweme.author?.short_id || 'douyin_user',
      nickname: aweme.author?.nickname || 'Douyin Creator',
      avatar: aweme.author?.avatar_thumb?.url_list?.[0] || aweme.author?.avatar_medium?.url_list?.[0] || '',
    },
    stats: {
      plays: aweme.statistics?.play_count || 0,
      likes: aweme.statistics?.digg_count || 0,
      comments: aweme.statistics?.comment_count || 0,
      shares: aweme.statistics?.share_count || 0,
      downloads: aweme.statistics?.collect_count || 0,
    },
    video: {
      noWatermark: noWatermarkVideo,
      hd: hdVideo,
      watermark: watermarkVideo,
      size: videoSize,
      hdSize: hdVideoSize,
      backupUrls,
    },
    audio: {
      id: String(aweme.music?.id || aweme.music?.mid || ''),
      title: audioTitle,
      author: audioAuthor,
      url: audioUrl,
      duration: audioDuration,
    },
    images,
    platform: 'douyin' as const,
  };
}

// Douyin Extraction Tiers:
// Tầng 2: Mobile SSR HTML Page Extractor (trích xuất _ROUTER_DATA / RENDER_DATA / __UNIVERSAL_DATA_FOR_REHYDRATION__)
async function extractDouyinMobileSSR(awemeId: string, targetUrl: string) {
  const ttwid = await getTtwid();
  const urlsToFetch = [
    `https://www.douyin.com/share/video/${awemeId}`,
    `https://www.douyin.com/video/${awemeId}`,
    `https://www.iesdouyin.com/share/video/${awemeId}/`,
  ];

  for (const pageUrl of urlsToFetch) {
    try {
      const pageRes = await smartFetch(pageUrl, {
        headers: {
          'User-Agent': DOUYIN_MOBILE_USER_AGENT,
          Referer: 'https://www.douyin.com/',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Cookie: ttwid ? `ttwid=${ttwid};` : '',
        },
        timeout: 5000,
        useProxy: true,
      });

      if (!pageRes.ok) continue;
      const html = await pageRes.text();

      // 1. window._ROUTER_DATA / window._SSR_DATA
      const routerMatch =
        html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\});<\/script>/) ||
        html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})\s*;/);
      if (routerMatch && routerMatch[1]) {
        try {
          const parsed = JSON.parse(routerMatch[1]);
          const loaderData = parsed?.loaderData;
          const item =
            loaderData?.[`video_(id)/page`]?.videoInfoRes?.item_list?.[0] ||
            loaderData?.[`video_(${awemeId})/page`]?.videoInfoRes?.item_list?.[0] ||
            parsed?.[`video_(${awemeId})/page`]?.videoInfoRes?.item_list?.[0] ||
            loaderData?.['video-detail']?.awemeDetail;
          if (item) {
            return formatDouyinAweme(item, targetUrl, awemeId);
          }
        } catch {
          // ignore
        }
      }

      // 2. RENDER_DATA
      const renderMatch = html.match(/<script id="RENDER_DATA" type="application\/json">([\s\S]*?)<\/script>/);
      if (renderMatch && renderMatch[1]) {
        try {
          const decoded = decodeURIComponent(renderMatch[1].trim());
          const parsed = JSON.parse(decoded);
          const detail =
            parsed?.appContext?._state?.awemeDetail ||
            parsed?.[`video_(${awemeId})/page`]?.videoInfoRes?.item_list?.[0] ||
            (Object.values(parsed || {}).find((v: any) => v?.videoInfoRes?.item_list?.[0]) as any)?.videoInfoRes?.item_list?.[0];
          if (detail) {
            return formatDouyinAweme(detail, targetUrl, awemeId);
          }
        } catch {
          // ignore
        }
      }

      // 3. __UNIVERSAL_DATA_FOR_REHYDRATION__
      const uniMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
      if (uniMatch && uniMatch[1]) {
        try {
          const parsed = JSON.parse(uniMatch[1]);
          const loaderData = parsed?.__DEFAULT_SCOPE__?.['webapp.user-sub-route']?.loaderData;
          const detail =
            loaderData?.[`video_(${awemeId})/page`]?.videoInfoRes?.item_list?.[0] ||
            loaderData?.[`video_(id)/page`]?.videoInfoRes?.item_list?.[0] ||
            parsed?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.awemeDetail;
          if (detail) {
            return formatDouyinAweme(detail, targetUrl, awemeId);
          }
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      console.warn('Douyin Mobile SSR attempt failed for', pageUrl, err?.message || err);
    }
  }
  return null;
}

// Tầng 3: Native ByteDance API qua WARP SOCKS5 Proxy (127.0.0.1:40000)
async function extractDouyinNativeApiWarp(awemeId: string, targetUrl: string) {
  const ttwid = await getTtwid();

  // 1. iesdouyin iteminfo API
  try {
    const iesRes = await smartFetch(`https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${awemeId}`, {
      headers: {
        'User-Agent': DOUYIN_MOBILE_USER_AGENT,
        Referer: 'https://www.douyin.com/',
        Accept: 'application/json, text/plain, */*',
        Cookie: ttwid ? `ttwid=${ttwid};` : '',
      },
      timeout: 6000,
      useProxy: true,
    });
    if (iesRes.ok) {
      const iesJson = await iesRes.json();
      if (iesJson?.item_list?.[0]) {
        return formatDouyinAweme(iesJson.item_list[0], targetUrl, awemeId);
      }
    }
  } catch (e: any) {
    console.warn('Douyin ies API fetch failed:', e?.message || e);
  }

  // 2. douyin.com webapp detail endpoint (qua Render Relay & Proxy)
  try {
    const detailApiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&device_platform=webapp&version_code=170400&channel=channel_pc_web`;
    let json: any = null;
    try {
      json = await fetchViaRender(detailApiUrl, {
        headers: {
          'User-Agent': DOUYIN_USER_AGENT,
          Referer: `https://www.douyin.com/video/${awemeId}`,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Cookie: ttwid ? `ttwid=${ttwid};` : '',
        },
      });
    } catch (renderErr: any) {
      console.warn('fetchViaRender detailApiUrl failed, falling back to smartFetch:', renderErr?.message || renderErr);
      const response = await smartFetch(detailApiUrl, {
        headers: {
          'User-Agent': DOUYIN_USER_AGENT,
          Referer: `https://www.douyin.com/video/${awemeId}`,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Cookie: ttwid ? `ttwid=${ttwid};` : '',
        },
        timeout: 6000,
        useProxy: true,
      });
      if (response.ok) {
        json = await response.json();
      }
    }

    if (json?.aweme_detail) {
      return formatDouyinAweme(json.aweme_detail, targetUrl, awemeId);
    }
  } catch (e: any) {
    console.warn('Douyin Web Detail API fetch failed:', e?.message || e);
  }

  return null;
}

// TikTok Official ByteDance Mobile Feed Extractor (Tier 1: Direct, highest quality, no watermark)
const TIKTOK_FEED_HOSTS = [
  'api19-normal-useast5.tiktokv.us',
  'api16-normal-useast5.tiktokv.us',
  'api16-normal-c-useast1a.tiktokv.com',
  'api16-va.tiktokv.com',
];

async function extractTikTokOfficial(videoId: string) {
  for (const host of TIKTOK_FEED_HOSTS) {
    try {
      const feedUrl = `https://${host}/aweme/v1/feed/?aweme_id=${videoId}&version_name=1.1.9&version_code=2018111632&build_number=1.1.9&device_platform=android&os_version=10`;
      const res = await fetch(feedUrl, {
        method: 'OPTIONS',
        headers: {
          'User-Agent':
            'com.zhiliaoapp.musically/300904 (2018111632; U; Android 10; en_US; Pixel 4; Build/QQ3A.200805.001; Cronet/58.0.2991.0)',
          Accept: '*/*',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok && res.status !== 200) continue;

      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf || buf.length === 0) continue;

      let jsonStr = '';
      if (buf[0] === 0x1f && buf[1] === 0x8b) {
        jsonStr = zlib.gunzipSync(buf).toString('utf8');
      } else if (buf[0] === 0x7b) {
        jsonStr = buf.toString('utf8');
      } else {
        try {
          jsonStr = zlib.brotliDecompressSync(buf).toString('utf8');
        } catch {
          jsonStr = buf.toString('utf8');
        }
      }

      if (!jsonStr.startsWith('{')) continue;

      const data = JSON.parse(jsonStr);
      const aweme = data.aweme_list?.find((item: any) => String(item.aweme_id) === String(videoId));
      if (
        aweme &&
        String(aweme.aweme_id) === String(videoId) &&
        (aweme.video?.play_addr || (aweme.image_post_info?.images && aweme.image_post_info.images.length > 0))
      ) {
        return aweme;
      }
    } catch {
      // try next host
    }
  }
  return null;
}

// SSSTik Extractor (fallback)
async function extractFromSSSTik(targetUrl: string) {
  try {
    let cleanUrl = targetUrl;
    try {
      const parsed = new URL(targetUrl);
      if (parsed.pathname.includes('/video/') || parsed.pathname.includes('/photo/')) {
        cleanUrl = `${parsed.origin}${parsed.pathname}`;
      }
    } catch {
      // ignore
    }

    const pageRes = await fetch('https://ssstik.io/en', {
      headers: { 'User-Agent': TIKTOK_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!pageRes.ok) return null;
    const pageHtml = await pageRes.text();
    const m = pageHtml.match(/s_tt\s*=\s*['"]([^'"]+)['"]/);
    if (!m) return null;

    const cookie = pageRes.headers.get('set-cookie') || '';
    const postRes = await fetch('https://ssstik.io/abc?url=dl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': TIKTOK_USER_AGENT,
        'HX-Request': 'true',
        'HX-Target': 'target',
        'HX-Current-URL': 'https://ssstik.io/en',
        Cookie: cookie,
        Origin: 'https://ssstik.io',
        Referer: 'https://ssstik.io/en',
      },
      body: new URLSearchParams({ id: cleanUrl, locale: 'en', tt: m[1] }),
      signal: AbortSignal.timeout(8000),
    });

    if (!postRes.ok) return null;
    const html = await postRes.text();

    const videoMatch = html.match(/href="([^"]+)"[^>]*class="[^"]*without_watermark/);
    const titleMatch = html.match(/<p[^>]*class="maintext"[^>]*>(.*?)<\/p>/);
    const authorMatch = html.match(/<h2>(.*?)<\/h2>/);
    const avatarMatch = html.match(/<img[^>]*class="result_author"[^>]*src="([^"]+)"/);
    const musicMatch = html.match(/href="([^"]+)"[^>]*class="[^"]*music/);

    const images: string[] = [];
    const splideMatches = [...html.matchAll(/<li[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/gi)];
    for (const sm of splideMatches) {
      if (sm[1] && sm[1].startsWith('http') && !images.includes(sm[1])) {
        images.push(sm[1]);
      }
    }

    if (videoMatch || images.length > 0) {
      return {
        video: videoMatch ? videoMatch[1] : '',
        images,
        title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '',
        author: authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').trim() : '',
        avatar: avatarMatch ? avatarMatch[1] : '',
        music: musicMatch ? musicMatch[1] : '',
      };
    }
  } catch (err: any) {
    console.warn('SSSTik extraction failed:', err?.message || err);
  }
  return null;
}

// TikWM Extractor with multiple fallback mirrors & increased timeout
async function extractFromTikWM(targetUrl: string) {
  // Clean tracking parameters to give cleaner URLs to TikWM
  let cleanUrl = targetUrl;
  try {
    const parsed = new URL(targetUrl);
    // Keep clean pathname if standard video or photo url
    if (parsed.pathname.includes('/video/') || parsed.pathname.includes('/photo/')) {
      cleanUrl = `${parsed.origin}${parsed.pathname}`;
    }
  } catch {
    // ignore
  }

  const urlsToTry = [cleanUrl];
  if (cleanUrl !== targetUrl) {
    urlsToTry.push(targetUrl);
  }

  const mirrors = [
    'https://www.tikwm.com/api/',
    'https://api.tikwm.com/api/',
  ];

  let lastError: Error | null = null;

  for (const url of urlsToTry) {
    // Fast GET request to tikwm (returns instantly with code 0 on valid URLs)
    try {
      const getRes = await smartFetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
        headers: { 'User-Agent': TIKTOK_USER_AGENT },
        timeout: 8000,
      });
      if (getRes.ok) {
        const json = (await getRes.json()) as any;
        if (json && json.code === 0 && json.data) {
          return json.data;
        }
      }
    } catch (err: any) {
      lastError = err;
    }

    for (const mirror of mirrors) {
      try {
        const response = await smartFetch(mirror, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': TIKTOK_USER_AGENT,
            Accept: 'application/json, text/javascript, */*; q=0.01',
          },
          body: new URLSearchParams({
            url,
            count: '12',
            cursor: '0',
            web: '1',
            hd: '1',
          }),
          timeout: 8000,
        });

        if (!response.ok) {
          continue;
        }

        const json = (await response.json()) as any;
        if (json && json.code === 0 && json.data) {
          return json.data;
        }
      } catch (err: any) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('Không thể trích xuất dữ liệu từ TikTok');
}

// Tiklydown API Extractor (Tier 3 fallback for both Douyin and TikTok)
async function extractFromTiklydown(targetUrl: string) {
  const endpoints = [
    `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(targetUrl)}`,
    `https://api.tiklydown.eu.org/api/download/v2?url=${encodeURIComponent(targetUrl)}`,
    `https://api.tiklydown.eu.org/api/download/v3?url=${encodeURIComponent(targetUrl)}`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await smartFetch(ep, {
        headers: { 'User-Agent': TIKTOK_USER_AGENT, Accept: 'application/json' },
        timeout: 8000,
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        if (json && (json.video || json.images || json.status === 200 || json.status === 'success' || json.result)) {
          const data = json.result || json.data || json;
          const isPhotos = Array.isArray(data.images) && data.images.length > 0;
          const images = isPhotos
            ? data.images
                .map((img: any) => (typeof img === 'string' ? img : img.url || img.url_list?.[0]))
                .filter(Boolean)
            : [];
          const noWatermark =
            data.video?.noWatermark || data.video?.url || data.video?.play_addr?.url_list?.[0] || data.video_url || '';
          const hd = data.video?.watermark || data.video?.hd_url || noWatermark;
          const audioUrl = data.music?.play_url?.url_list?.[0] || data.music?.url || data.music_url || '';

          if (noWatermark || images.length > 0) {
            return {
              id: String(data.id || Date.now()),
              url: targetUrl,
              title: data.title || data.desc || 'Media',
              mediaType: (isPhotos ? 'photos' : 'video') as 'photos' | 'video',
              cover: normalizeMediaUrl(data.cover || data.video?.cover || images[0]),
              duration: data.duration || 0,
              createdAt: new Date().toISOString(),
              author: {
                id: String(data.author?.id || data.author?.uid || ''),
                uniqueId: data.author?.unique_id || data.author?.username || 'creator',
                nickname: data.author?.nickname || data.author?.name || 'Creator',
                avatar: normalizeMediaUrl(data.author?.avatar || data.author?.avatar_thumb?.url_list?.[0]),
              },
              stats: {
                plays: data.stats?.play_count || 0,
                likes: data.stats?.like_count || data.stats?.digg_count || 0,
                comments: data.stats?.comment_count || 0,
                shares: data.stats?.share_count || 0,
                downloads: data.stats?.download_count || 0,
              },
              video: {
                noWatermark: normalizeMediaUrl(noWatermark),
                hd: normalizeMediaUrl(hd),
                watermark: normalizeMediaUrl(data.video?.watermark || noWatermark),
                size: 0,
                hdSize: 0,
                backupUrls: [normalizeMediaUrl(hd), normalizeMediaUrl(noWatermark)].filter(Boolean),
              },
              images: images.map((u: string) => normalizeMediaUrl(u)),
              audio: {
                url: normalizeMediaUrl(audioUrl),
                title: data.music?.title || 'Audio Track',
                author: data.music?.author || 'Creator',
                duration: data.music?.duration || 0,
              },
            };
          }
        }
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}

// Fallback HTML / oEmbed extractor for basic info if external API is restricted
async function extractOEmbedInfo(targetUrl: string) {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl)}`;
    const res = await smartFetch(oembedUrl, {
      headers: { 'User-Agent': TIKTOK_USER_AGENT },
      timeout: 5000,
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return data;
    }
  } catch {
    // ignore
  }
  return null;
}

// Session cache for MusicalDown to speed up requests
let mdSessionCache: {
  cookies: string;
  urlField: string;
  hiddenField: string;
  hiddenVal: string;
  timestamp: number;
} | null = null;

// Fallback high-speed TikTok extractor via MusicalDown engine
async function extractFromMusicalDown(tiktokUrl: string) {
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  let cookies = '';
  let urlField = '';
  let hiddenField = '';
  let hiddenVal = '';

  const now = Date.now();
  if (mdSessionCache && now - mdSessionCache.timestamp < 5 * 60 * 1000) {
    cookies = mdSessionCache.cookies;
    urlField = mdSessionCache.urlField;
    hiddenField = mdSessionCache.hiddenField;
    hiddenVal = mdSessionCache.hiddenVal;
  } else {
    const homeRes = await fetch('https://musicaldown.com/en', {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(15000),
    });
    cookies = homeRes.headers.get('set-cookie') || '';
    const html = await homeRes.text();

    const urlInputMatch = html.match(/<input name="([^"]+)"[^>]*id="link_url"/);
    const hiddenInputMatch = html.match(/<input name="([^"]+)" type="hidden" value="([^"]+)"/);

    if (!urlInputMatch || !hiddenInputMatch) {
      throw new Error('Could not parse MusicalDown form');
    }

    urlField = urlInputMatch[1];
    hiddenField = hiddenInputMatch[1];
    hiddenVal = hiddenInputMatch[2];

    mdSessionCache = {
      cookies,
      urlField,
      hiddenField,
      hiddenVal,
      timestamp: now,
    };
  }

  const body = new URLSearchParams();
  body.append(urlField, tiktokUrl);
  body.append(hiddenField, hiddenVal);
  body.append('verify', '1');

  const dlRes = await fetch('https://musicaldown.com/download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      Cookie: cookies,
      Referer: 'https://musicaldown.com/en',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(20000),
  });

  if (!dlRes.ok) {
    mdSessionCache = null; // Clear cache on failure
    throw new Error('MusicalDown request failed');
  }

  const resultHtml = await dlRes.text();

  // Extract fastdl download links
  const downloadLinks = [...resultHtml.matchAll(/href="([^"]+)"[^>]*download/gi)].map((m) => m[1]);

  let videoHd = '';
  let videoNoWm = '';
  let audioUrl = '';

  for (const link of downloadLinks) {
    let directCdn = '';
    let isAudio = false;
    try {
      const tokenMatch = link.match(/token=([a-zA-Z0-9_\-.]+)/);
      if (tokenMatch) {
        const payload = JSON.parse(Buffer.from(tokenMatch[1].split('.')[1], 'base64').toString('utf8'));
        if (payload.type === 'mp3') {
          isAudio = true;
          directCdn = payload.mp3 || payload.url || '';
        } else {
          directCdn = payload.url || '';
        }
      }
    } catch {
      // ignore
    }

    if (isAudio || link.includes('type=mp3')) {
      if (!audioUrl) audioUrl = directCdn || link;
    } else {
      if (!videoHd) {
        videoHd = directCdn || link;
      } else if (!videoNoWm) {
        videoNoWm = directCdn || link;
      }
    }
  }

  if (!videoNoWm) videoNoWm = videoHd;

  // Title / description
  const titleMatch =
    resultHtml.match(/<h2[^>]*class="[^"]*video-desc[^"]*"[^>]*>([\s\S]*?)<\/h2>/i) ||
    resultHtml.match(/<p[^>]*class="[^"]*video-desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'TikTok Media';

  // Author
  const authorMatch = resultHtml.match(/<h2[^>]*class="[^"]*video-author[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
  const author = authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').trim() : 'tiktok_user';

  // Thumbnail
  const imgMatch = resultHtml.match(/<img[^>]*class="[^"]*responsive-img[^"]*"[^>]*src="([^"]+)"/i);
  const cover = imgMatch ? imgMatch[1] : '';

  return {
    videoHd,
    videoNoWm,
    audioUrl,
    title,
    author: author.replace(/^@/, ''),
    cover,
  };
}

// Extract endpoint supporting both TikTok & Douyin
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
      // Check if text contains a link to either platform
      const hasDouyin = /douyin\.com|iesdouyin\.com/.test(trimmedUrl);
      const hasTikTok = /tiktok\.com/.test(trimmedUrl);
      if (!hasDouyin && !hasTikTok) {
        res.status(400).json({
          success: false,
          message: 'URL không thuộc nền tảng TikTok hoặc Douyin. Vui lòng kiểm tra lại liên kết.',
        });
        return;
      }
    }

    // Resolve shortlink if needed (e.g. v.douyin.com, vt.tiktok.com)
    const resolvedUrl = await resolveFinalUrl(cleanTargetUrl || trimmedUrl);
    const targetIsDouyin = isDouyinUrl(resolvedUrl) || isDouyinUrl(cleanTargetUrl) || isDouyinUrl(trimmedUrl);

    if (targetIsDouyin) {
      const douyinUrlsToTry = [cleanTargetUrl, trimmedUrl, resolvedUrl].filter(Boolean);
      const awemeId = extractDouyinId(resolvedUrl) || extractDouyinId(cleanTargetUrl) || extractDouyinId(trimmedUrl);

      // TẦNG 1 (TikWM Engine): Nhận diện cả link ngắn (v.douyin.com/...) và link chuẩn, bóc tách nhanh trong 0.3s
      for (const dUrl of douyinUrlsToTry) {
        try {
          const tikwmData = await extractFromTikWM(dUrl);
          if (tikwmData && (tikwmData.play || (Array.isArray(tikwmData.images) && tikwmData.images.length > 0))) {
            const isPhotoSlide = Array.isArray(tikwmData.images) && tikwmData.images.length > 0;
            const mediaType = isPhotoSlide ? 'photos' : 'video';
            const result = {
              id: String(tikwmData.id || awemeId || Date.now()),
              url: resolvedUrl || cleanTargetUrl,
              title: tikwmData.title || 'Douyin Media',
              mediaType,
              cover: normalizeMediaUrl(tikwmData.cover || tikwmData.origin_cover),
              duration: tikwmData.duration || 0,
              createdAt: tikwmData.create_time ? new Date(tikwmData.create_time * 1000).toISOString() : new Date().toISOString(),
              author: {
                id: String(tikwmData.author?.id || ''),
                uniqueId: tikwmData.author?.unique_id || 'douyin_user',
                nickname: tikwmData.author?.nickname || 'Douyin Creator',
                avatar: normalizeMediaUrl(tikwmData.author?.avatar),
              },
              stats: {
                plays: tikwmData.play_count || 0,
                likes: tikwmData.digg_count || 0,
                comments: tikwmData.comment_count || 0,
                shares: tikwmData.share_count || 0,
                downloads: tikwmData.download_count || 0,
              },
              video: {
                noWatermark: normalizeMediaUrl(tikwmData.play),
                hd: normalizeMediaUrl(tikwmData.hdplay || tikwmData.play),
                watermark: normalizeMediaUrl(tikwmData.wmplay),
                size: tikwmData.size || 0,
                hdSize: tikwmData.hd_size || 0,
                backupUrls: [
                  normalizeMediaUrl(tikwmData.hdplay),
                  normalizeMediaUrl(tikwmData.play),
                  normalizeMediaUrl(tikwmData.wmplay),
                ].filter(Boolean),
              },
              audio: {
                id: String(tikwmData.music_info?.id || ''),
                title: tikwmData.music_info?.title || tikwmData.music || 'Âm thanh Douyin',
                author: tikwmData.music_info?.author || tikwmData.author?.nickname || '',
                url: normalizeMediaUrl(tikwmData.music || tikwmData.music_info?.play || ''),
                duration: tikwmData.music_info?.duration || 0,
              },
              images: isPhotoSlide ? (tikwmData.images || []).map((img: string) => normalizeMediaUrl(img)) : [],
              platform: 'douyin' as const,
            };
            res.json({ success: true, data: result });
            return;
          }
        } catch (tikwmErr: any) {
          // Log and seamlessly failover to Tier 2
          console.warn('Douyin Tier 1 (TikWM) failed for', dUrl, tikwmErr?.message || tikwmErr);
        }
      }

      // TẦNG 2 (Trang chia sẻ Mobile HTML): Trích xuất window._ROUTER_DATA / RENDER_DATA từ trang SSR của ByteDance
      if (awemeId) {
        try {
          const ssrData = await extractDouyinMobileSSR(awemeId, resolvedUrl || cleanTargetUrl);
          if (ssrData) {
            res.json({ success: true, data: ssrData });
            return;
          }
        } catch (ssrErr: any) {
          console.warn('Douyin Tier 2 (Mobile SSR) failed:', ssrErr?.message || ssrErr);
        }
      }

      // TẦNG 3 (Native API qua WARP SOCKS5): Kết nối qua cổng proxy 127.0.0.1:40000 của Cloudflare WARP
      if (awemeId) {
        try {
          const warpNativeData = await extractDouyinNativeApiWarp(awemeId, resolvedUrl || cleanTargetUrl);
          if (warpNativeData) {
            res.json({ success: true, data: warpNativeData });
            return;
          }
        } catch (warpErr: any) {
          console.warn('Douyin Tier 3 (Native WARP API) failed:', warpErr?.message || warpErr);
        }
      }

      // Fallback Tier 4: Tiklydown backup scraper
      for (const dUrl of douyinUrlsToTry) {
        try {
          const tiklyData = await extractFromTiklydown(dUrl);
          if (tiklyData) {
            res.json({ success: true, data: { ...tiklyData, platform: 'douyin' as const } });
            return;
          }
        } catch {
          // try next
        }
      }

      const errMsg = 'Không thể trích xuất dữ liệu từ video/bài viết Douyin. Vui lòng kiểm tra lại liên kết hoặc thử lại sau vài giây.';
      res.status(422).json({
        success: false,
        error: errMsg,
        message: errMsg,
      });
      return;
    }

    // TikTok extraction pipeline:
    // Tier 1: Direct official ByteDance mobile feed API (fastest, pristine quality, no watermark)
    // Tier 2: TikWM API with multiple fallback mirrors (rich metadata, full stats, HD video)
    // Tier 3: SSSTik high-speed engine (watermark-free CDN mirrors)
    // Tier 4: MusicalDown engine
    // Tier 5: oEmbed metadata fallback
    try {
      const tiktokId = extractTikTokId(resolvedUrl) || extractTikTokId(trimmedUrl);

      // Tier 1: Direct official ByteDance mobile feed API (Strict aweme_id check)
      if (tiktokId) {
        try {
          const aweme = await extractTikTokOfficial(tiktokId);
          if (aweme && String(aweme.aweme_id) === String(tiktokId)) {
            const isPhotoSlide = Boolean(
              (aweme.image_post_info?.images && aweme.image_post_info.images.length > 0) ||
              (aweme.images && aweme.images.length > 0)
            );
            const rawImages = aweme.image_post_info?.images || aweme.images || [];
            const images = rawImages
              .map((img: any) =>
                normalizeMediaUrl(
                  img.display_image?.url_list?.[0] ||
                  img.owner_watermark_image?.url_list?.[0] ||
                  img.user_watermark_image?.url_list?.[0] ||
                  img.url_list?.[0] ||
                  img
                )
              )
              .filter(Boolean);

            const videoUrls = [
              aweme.video?.play_addr?.url_list?.[0],
              aweme.video?.bit_rate?.[0]?.play_addr?.url_list?.[0],
              aweme.video?.play_addr?.url_list?.[1],
              aweme.video?.download_addr?.url_list?.[0],
            ]
              .filter(Boolean)
              .map((u: string) => normalizeMediaUrl(u));

            const primaryVideoUrl = videoUrls[0] || '';
            const hdVideoUrl = videoUrls[1] || primaryVideoUrl;
            const audioUrl = normalizeMediaUrl(aweme.music?.play_url?.url_list?.[0] || '');

            const result = {
              id: String(aweme.aweme_id || tiktokId),
              url: resolvedUrl,
              title: aweme.desc || 'TikTok Media',
              mediaType: isPhotoSlide ? ('photos' as const) : ('video' as const),
              cover: normalizeMediaUrl(
                aweme.video?.cover?.url_list?.[0] || aweme.video?.origin_cover?.url_list?.[0] || ''
              ),
              duration: Math.round((aweme.video?.duration || 0) / 1000) || aweme.duration || 0,
              createdAt: aweme.create_time
                ? new Date(aweme.create_time * 1000).toISOString()
                : new Date().toISOString(),
              author: {
                id: String(aweme.author?.uid || ''),
                uniqueId: aweme.author?.unique_id || 'tiktok_user',
                nickname: aweme.author?.nickname || 'TikTok Creator',
                avatar: normalizeMediaUrl(
                  aweme.author?.avatar_thumb?.url_list?.[0] ||
                  aweme.author?.avatar_medium?.url_list?.[0] ||
                  ''
                ),
              },
              stats: {
                plays: aweme.statistics?.play_count || 0,
                likes: aweme.statistics?.digg_count || 0,
                comments: aweme.statistics?.comment_count || 0,
                shares: aweme.statistics?.share_count || 0,
                downloads: aweme.statistics?.download_count || 0,
              },
              video: {
                noWatermark: primaryVideoUrl,
                hd: hdVideoUrl,
                watermark: normalizeMediaUrl(aweme.video?.download_addr?.url_list?.[0] || ''),
                size: aweme.video?.play_addr?.data_size || aweme.video?.size || 0,
                hdSize: aweme.video?.bit_rate?.[0]?.play_addr?.data_size || 0,
                backupUrls: videoUrls,
              },
              audio: {
                id: String(aweme.music?.id || ''),
                title: aweme.music?.title || 'Âm thanh TikTok',
                author: aweme.music?.author || aweme.author?.nickname || '',
                url: audioUrl,
                duration: aweme.music?.duration || 0,
              },
              images: isPhotoSlide ? images : [],
              platform: 'tiktok' as const,
            };

            res.json({ success: true, data: result });
            return;
          }
        } catch (officialErr: any) {
          console.warn('Official TikTok feed extraction failed:', officialErr?.message || officialErr);
        }
      }

      // Tier 2: TikWM Extractor (with mirror failover & rich metadata: stats, author info, HD quality)
      let data: any = null;
      try {
        data = await extractFromTikWM(resolvedUrl);
      } catch (tikwmErr: any) {
        console.warn('TikWM primary extraction attempt failed:', tikwmErr?.message || tikwmErr);
      }

      if (
        data &&
        (!tiktokId || !data.id || String(data.id) === String(tiktokId)) &&
        (data.play || (Array.isArray(data.images) && data.images.length > 0))
      ) {
        const isPhotoSlide = Array.isArray(data.images) && data.images.length > 0;
        const mediaType = isPhotoSlide ? 'photos' : 'video';

        // Extract direct CDN audio stream
        let rawAudioUrl = '';
        if (data.music_info?.play && typeof data.music_info.play === 'string' && data.music_info.play.startsWith('http')) {
          rawAudioUrl = data.music_info.play;
        } else if (isPhotoSlide && data.play && typeof data.play === 'string' && data.play.startsWith('http')) {
          rawAudioUrl = data.play;
        } else if (data.music && typeof data.music === 'string' && data.music.startsWith('http')) {
          rawAudioUrl = data.music;
        } else {
          rawAudioUrl = normalizeMediaUrl(data.music || data.music_info?.play || (isPhotoSlide ? data.play : ''));
        }

        const result = {
          id: String(data.id || tiktokId || Date.now()),
          url: resolvedUrl,
          title: data.title || 'TikTok Media',
          mediaType,
          cover: normalizeMediaUrl(data.cover || data.origin_cover),
          duration: data.duration || 0,
          createdAt: data.create_time ? new Date(data.create_time * 1000).toISOString() : new Date().toISOString(),
          author: {
            id: String(data.author?.id || ''),
            uniqueId: data.author?.unique_id || 'tiktok_user',
            nickname: data.author?.nickname || 'TikTok Creator',
            avatar: normalizeMediaUrl(data.author?.avatar),
          },
          stats: {
            plays: data.play_count || 0,
            likes: data.digg_count || 0,
            comments: data.comment_count || 0,
            shares: data.share_count || 0,
            downloads: data.download_count || 0,
          },
          video: {
            noWatermark: normalizeMediaUrl(data.play),
            hd: normalizeMediaUrl(data.hdplay || data.play),
            watermark: normalizeMediaUrl(data.wmplay),
            size: data.size || 0,
            hdSize: data.hd_size || 0,
            backupUrls: [
              normalizeMediaUrl(data.hdplay),
              normalizeMediaUrl(data.play),
              normalizeMediaUrl(data.wmplay),
            ].filter(Boolean),
          },
          audio: {
            id: String(data.music_info?.id || ''),
            title: data.music_info?.title || data.music || 'Âm thanh TikTok',
            author: data.music_info?.author || data.author?.nickname || '',
            url: rawAudioUrl,
            duration: data.music_info?.duration || 0,
          },
          images: isPhotoSlide ? (data.images || []).map((img: string) => normalizeMediaUrl(img)) : [],
          platform: 'tiktok' as const,
        };

        res.json({ success: true, data: result });
        return;
      }

      // Tier 3: SSSTik High-Speed Extractor (reliable fallback)
      try {
        const sssData = await extractFromSSSTik(resolvedUrl);
        if (sssData && (sssData.video || sssData.images.length > 0)) {
          const isPhotoSlide = sssData.images.length > 0;
          const result = {
            id: String(tiktokId || Date.now()),
            url: resolvedUrl,
            title: sssData.title || 'TikTok Media',
            mediaType: isPhotoSlide ? ('photos' as const) : ('video' as const),
            cover: sssData.avatar || '',
            duration: 0,
            createdAt: new Date().toISOString(),
            author: {
              id: '',
              uniqueId: sssData.author.replace(/\s+/g, '_') || 'tiktok_user',
              nickname: sssData.author || 'TikTok Creator',
              avatar: normalizeMediaUrl(sssData.avatar),
            },
            stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
            video: {
              noWatermark: sssData.video,
              hd: sssData.video,
              watermark: '',
              size: 0,
              hdSize: 0,
              backupUrls: [sssData.video].filter(Boolean),
            },
            audio: {
              id: '',
              title: sssData.title ? `Audio - ${sssData.title.slice(0, 30)}` : 'Âm thanh TikTok',
              author: sssData.author,
              url: sssData.music,
              duration: 0,
            },
            images: sssData.images.map((img) => normalizeMediaUrl(img)),
            platform: 'tiktok' as const,
          };

          res.json({ success: true, data: result });
          return;
        }
      } catch (sssErr: any) {
        console.warn('SSSTik secondary extraction failed:', sssErr?.message || sssErr);
      }

      // Tier 4: High-speed extraction via MusicalDown
      try {
        const mdData = await extractFromMusicalDown(resolvedUrl);
        if (mdData && (mdData.videoHd || mdData.videoNoWm || mdData.audioUrl)) {
          const result = {
            id: String(Date.now()),
            url: resolvedUrl,
            title: mdData.title || 'TikTok Media',
            mediaType: 'video' as const,
            cover: mdData.cover || '',
            duration: 0,
            createdAt: new Date().toISOString(),
            author: {
              id: '',
              uniqueId: mdData.author || 'tiktok_user',
              nickname: mdData.author || 'TikTok Creator',
              avatar: '',
            },
            stats: {
              plays: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              downloads: 0,
            },
            video: {
              noWatermark: mdData.videoNoWm,
              hd: mdData.videoHd,
              watermark: '',
              size: 0,
              hdSize: 0,
              backupUrls: [mdData.videoHd, mdData.videoNoWm].filter(Boolean),
            },
            audio: {
              id: '',
              title: mdData.title ? `Audio - ${mdData.title.slice(0, 30)}` : 'Âm thanh TikTok',
              author: mdData.author,
              url: mdData.audioUrl,
              duration: 0,
            },
            images: [],
            platform: 'tiktok' as const,
          };

          res.json({ success: true, data: result });
          return;
        }
      } catch (mdErr: any) {
        console.warn('MusicalDown tertiary extraction failed:', mdErr?.message || mdErr);
      }

      // Tier 5: Tiklydown fallback
      try {
        const tiklyData = await extractFromTiklydown(resolvedUrl);
        if (tiklyData) {
          res.json({ success: true, data: { ...tiklyData, platform: 'tiktok' as const } });
          return;
        }
      } catch (tiklyErr: any) {
        console.warn('Tiklydown fallback failed:', tiklyErr?.message || tiklyErr);
      }

      // Tier 6: Fallback to oEmbed if scrapers are temporarily protected
      const oembed = await extractOEmbedInfo(resolvedUrl);
      if (oembed) {
        res.json({
          success: true,
          data: {
            id: String(Date.now()),
            url: resolvedUrl,
            title: oembed.title || 'TikTok Post',
            mediaType: 'video',
            cover: oembed.thumbnail_url || '',
            duration: 0,
            createdAt: new Date().toISOString(),
            author: {
              id: '',
              uniqueId: oembed.author_unique_id || oembed.author_name?.replace(/\s+/g, '_') || 'tiktok_user',
              nickname: oembed.author_name || 'TikTok Creator',
              avatar: '',
            },
            stats: { plays: 0, likes: 0, comments: 0, shares: 0, downloads: 0 },
            video: { noWatermark: '', hd: '', watermark: '', size: 0, hdSize: 0, backupUrls: [] },
            audio: { id: '', title: '', author: '', url: '', duration: 0 },
            images: [],
            platform: 'tiktok',
            isPartial: true,
            warning: 'Máy chủ TikTok đang bảo vệ đường truyền trực tiếp. Bạn có thể thử lại sau vài giây.',
          },
        });
        return;
      }

      throw new Error('Không thể lấy thông tin video TikTok. Vui lòng kiểm tra lại liên kết hoặc thử lại.');
    } catch (primaryError: any) {
      console.error('TikTok extraction error:', primaryError?.message || primaryError);
      const msg = primaryError?.message || 'Lỗi khi trích xuất thông tin media. Vui lòng kiểm tra lại link.';
      res.status(422).json({
        success: false,
        error: msg,
        message: msg,
      });
      return;
    }
  } catch (error: any) {
    console.error('Extraction error:', error);
    const msg = error?.message || 'Lỗi khi trích xuất thông tin media. Vui lòng kiểm tra lại link.';
    res.status(422).json({
      success: false,
      error: msg,
      message: msg,
    });
  }
});

// Helper to perform fetch with a timeout that ONLY applies to connection and header reception,
// ensuring the returned streaming response body is not prematurely aborted during prolonged download.
async function fetchWithConnectTimeout(
  url: string,
  options: any = {},
  connectTimeoutMs = 8000
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, connectTimeoutMs);

  const fetchOptions: any = {
    ...options,
    signal: controller.signal,
  };

  // Try WARP Proxy Agent first if available
  if (warpAgent) {
    try {
      const res = await (fetch as any)(url, {
        ...fetchOptions,
        dispatcher: warpAgent,
        agent: warpAgent,
      });
      clearTimeout(timer);
      return res;
    } catch {
      // Fallback to direct fetch
    }
  }

  try {
    const res = await (fetch as any)(url, fetchOptions);
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Helper to verify that upstream response is a genuine media stream and not an HTML captcha / error snippet
function isValidMediaResponse(res: globalThis.Response | null): boolean {
  if (!res || (!res.ok && res.status !== 206)) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('text/plain') || ct.includes('application/json')) {
    return false;
  }
  const cl = Number(res.headers.get('content-length') || '0');
  if (cl > 0 && cl < 500) {
    return false;
  }
  return true;
}

// Helper to safely fetch media from CDN with deep redirect support, fallback strategies and varied headers
async function fetchMediaWithRetry(
  targetUrl: string,
  options: { isDouyin: boolean; range?: string }
): Promise<globalThis.Response | null> {
  const url = normalizeMediaUrl(targetUrl);
  if (!url) return null;

  const userAgent = options.isDouyin ? DOUYIN_USER_AGENT : TIKTOK_USER_AGENT;
  const referer = options.isDouyin ? 'https://www.douyin.com/' : 'https://www.tiktok.com/';

  // Get ttwid cookie if Douyin
  let cookieHeader = '';
  if (options.isDouyin) {
    try {
      const ttwid = await getTtwid();
      if (ttwid) {
        cookieHeader = `ttwid=${ttwid};`;
      }
    } catch {
      // ignore
    }
  }

  // Candidate URL variations (playwm vs play for Douyin)
  const candidateUrls: string[] = [url];
  if (options.isDouyin) {
    if (url.includes('playwm')) {
      const sanitized = url.replace('/playwm/', '/play/').replace(/playwm/g, 'play');
      if (!candidateUrls.includes(sanitized)) candidateUrls.push(sanitized);
    } else if (url.includes('/play/')) {
      const wm = url.replace('/play/', '/playwm/');
      if (!candidateUrls.includes(wm)) candidateUrls.push(wm);
    }
  }

  const CONNECT_TIMEOUT = 8000;

  // Helper to follow redirects up to maxHops preserving appropriate headers
  const followAndFetch = async (
    startUrl: string,
    reqHeaders: Record<string, string>,
    maxHops = 8
  ): Promise<globalThis.Response | null> => {
    let currentUrl = startUrl;
    for (let hop = 0; hop < maxHops; hop++) {
      try {
        const res = await fetchWithConnectTimeout(
          currentUrl,
          { method: 'GET', headers: reqHeaders, redirect: 'manual' },
          CONNECT_TIMEOUT
        );
        if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
          const loc = res.headers.get('location');
          if (loc) {
            currentUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).toString();
            continue;
          }
        }
        if (isValidMediaResponse(res)) {
          return res;
        }
        break;
      } catch {
        break;
      }
    }
    return null;
  };

  for (const candidate of candidateUrls) {
    const isCdnUrl = /douyinvod\.com|zjcdn\.com|byteimg\.com|ixigua\.com|pstatp\.com/i.test(candidate);
    const candidateCookie = isCdnUrl ? '' : cookieHeader;

    // Fast-path for direct CDN URLs: Native redirect follow without foreign cookies
    if (isCdnUrl) {
      try {
        const headers: Record<string, string> = {
          'User-Agent': userAgent,
          Accept: '*/*',
        };
        if (options.range) headers['Range'] = options.range;
        const res = await fetchWithConnectTimeout(
          candidate,
          { method: 'GET', headers, redirect: 'follow' },
          CONNECT_TIMEOUT
        );
        if (isValidMediaResponse(res)) return res;
      } catch {
        // continue to multi-strategy fallback
      }
    }

    // Strategy 1: Standard GET with Platform Headers (Referer, UA, Cookie, Range) & Deep Redirect Follow
    try {
      const headers: Record<string, string> = {
        'User-Agent': userAgent,
        Referer: referer,
        Accept: '*/*',
      };
      if (candidateCookie) headers['Cookie'] = candidateCookie;
      if (options.range) headers['Range'] = options.range;
      const res = await followAndFetch(candidate, headers, 8);
      if (res) return res;
    } catch {
      // try next
    }

    // Strategy 2: Direct request without Referer header (bypasses CDN referer blocks)
    try {
      const headers: Record<string, string> = {
        'User-Agent': userAgent,
        Accept: '*/*',
      };
      if (options.range) headers['Range'] = options.range;
      const res = await followAndFetch(candidate, headers, 8);
      if (res) return res;
    } catch {
      // try next
    }

    // Strategy 3: Request with Range (supports requested range or fallback bytes=0-)
    try {
      const headers: Record<string, string> = {
        'User-Agent': userAgent,
        Referer: referer,
        Range: options.range || 'bytes=0-',
        Accept: '*/*',
      };
      if (candidateCookie) headers['Cookie'] = candidateCookie;
      const res = await followAndFetch(candidate, headers, 8);
      if (res) return res;
    } catch {
      // try next
    }

    // Strategy 4: Native redirect: 'follow'
    try {
      const headers: Record<string, string> = {
        'User-Agent': userAgent,
        Accept: '*/*',
      };
      if (options.range) headers['Range'] = options.range;
      const res = await fetchWithConnectTimeout(
        candidate,
        { method: 'GET', headers, redirect: 'follow' },
        CONNECT_TIMEOUT
      );
      if (isValidMediaResponse(res)) return res;
    } catch {
      // try next candidate
    }
  }

  return null;
}

// Stream redirect endpoint: redirects to /api/tiktok/download proxy stream to prevent 403 CDN hotlinking blocks
app.get('/api/tiktok/stream-redirect', (req: Request, res: Response) => {
  const rawUrl = String(req.query.url || '').trim();
  const filename = String(req.query.filename || 'media.mp4').trim();

  if (!rawUrl) {
    res.status(400).send('Thiếu liên kết tải');
    return;
  }

  const downloadUrl = `/api/tiktok/download?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}`;
  res.redirect(302, downloadUrl);
});

// Proxy stream download endpoint (solves CORS & enforces proper attachment filename)
// Supports both GET and POST to handle long query strings without truncation
app.all('/api/tiktok/download', async (req: Request, res: Response) => {
  try {
    const rawUrl = ((req.query.url || req.body?.url) as string) || '';
    const fallbackUrl = ((req.query.fallbackUrl || req.body?.fallbackUrl) as string) || '';
    const postUrl = ((req.query.postUrl || req.body?.postUrl) as string) || '';
    const requestedFilename = ((req.query.filename || req.body?.filename) as string) || 'media.mp4';
    const backupUrls: string[] = Array.isArray(req.body?.backupUrls)
      ? req.body.backupUrls
      : typeof req.query.backupUrls === 'string'
      ? req.query.backupUrls.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    if (!rawUrl && !fallbackUrl && !postUrl && backupUrls.length === 0) {
      res.status(400).json({ success: false, error: 'Thiếu tham số liên kết tải' });
      return;
    }

    const checkIsDouyin = (u: string) =>
      Boolean(u) &&
      (isDouyinUrl(u) ||
        u.includes('zjcdn.com') ||
        u.includes('douyinvod.com') ||
        u.includes('byteimg.com') ||
        u.includes('douyinpic.com') ||
        u.includes('douyinstatic.com') ||
        u.includes('douyin.com') ||
        u.includes('bytedance.com') ||
        u.includes('snssdk.com') ||
        u.includes('ixigua.com') ||
        u.includes('amemv.com') ||
        u.includes('pstatp.com'));

    const isDouyin = checkIsDouyin(rawUrl || '') || checkIsDouyin(postUrl || '');
    const requestedRange = req.headers.range as string | undefined;

    // Step 1: Try primary URL
    let mediaResponse: globalThis.Response | null = null;
    if (rawUrl) {
      mediaResponse = await fetchMediaWithRetry(rawUrl, { isDouyin, range: requestedRange });
    }

    // Step 2: Try fallback URL if primary failed
    if (!isValidMediaResponse(mediaResponse) && fallbackUrl && fallbackUrl !== rawUrl) {
      mediaResponse = await fetchMediaWithRetry(fallbackUrl, { isDouyin, range: requestedRange });
    }

    // Step 3: Try backup CDN mirrors if provided
    if (!isValidMediaResponse(mediaResponse) && backupUrls.length > 0) {
      for (const backup of backupUrls.slice(0, 5)) {
        if (backup && backup !== rawUrl && backup !== fallbackUrl) {
          mediaResponse = await fetchMediaWithRetry(backup, { isDouyin, range: requestedRange });
          if (isValidMediaResponse(mediaResponse)) break;
        }
      }
    }

    // Step 4: If previous attempts failed (e.g. signed CDN token expired) and postUrl is present,
    // re-extract fresh unexpired media URLs on the server
    if (!isValidMediaResponse(mediaResponse) && postUrl) {
      try {
        if (isDouyin) {
          const freshData = await extractFromDouyin(postUrl, postUrl);
          if (freshData) {
            const freshUrl = requestedFilename.endsWith('.mp3')
              ? freshData.audio?.url
              : freshData.video?.hd || freshData.video?.noWatermark;
            if (freshUrl) {
              mediaResponse = await fetchMediaWithRetry(freshUrl, { isDouyin: true, range: requestedRange });
            }
          }
        } else {
          const tiktokId = extractTikTokId(postUrl);
          if (tiktokId) {
            const aweme = await extractTikTokOfficial(tiktokId);
            if (aweme) {
              const freshUrl = requestedFilename.endsWith('.mp3')
                ? aweme.music?.play_url?.url_list?.[0]
                : aweme.video?.bit_rate?.[0]?.play_addr?.url_list?.[0] || aweme.video?.play_addr?.url_list?.[0];
              if (freshUrl) {
                mediaResponse = await fetchMediaWithRetry(freshUrl, { isDouyin: false, range: requestedRange });
              }
            }
          }
          if (!isValidMediaResponse(mediaResponse)) {
            const sssData = await extractFromSSSTik(postUrl);
            if (sssData) {
              const freshUrl = requestedFilename.endsWith('.mp3') ? sssData.music : sssData.video;
              if (freshUrl) {
                mediaResponse = await fetchMediaWithRetry(freshUrl, { isDouyin: false, range: requestedRange });
              }
            }
          }
          if (!isValidMediaResponse(mediaResponse)) {
            const tikwmData = await extractFromTikWM(postUrl);
            if (tikwmData) {
              const freshUrl = requestedFilename.endsWith('.mp3')
                ? tikwmData.music
                : tikwmData.hdplay || tikwmData.play;
              if (freshUrl) {
                mediaResponse = await fetchMediaWithRetry(freshUrl, { isDouyin: false, range: requestedRange });
              }
            }
          }
        }
      } catch {
        // ignore fallback extraction failure
      }
    }

    // Fast-fail: If server proxy cannot connect upstream
    if (!isValidMediaResponse(mediaResponse) || !mediaResponse) {
      const errMsg = 'Máy chủ nguồn giới hạn luồng tải qua proxy hoặc đường dẫn đã hết hạn. Vui lòng tải lại trang hoặc thử liên kết khác.';
      res.status(502).json({
        success: false,
        fallbackToDirect: true,
        error: errMsg,
        message: errMsg,
      });
      return;
    }

    // Clean filename
    const safeFilename = requestedFilename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\;]/g, '_').trim() || 'media.mp4';
    const encodedFilename = encodeURIComponent(requestedFilename);

    let contentType = mediaResponse.headers.get('content-type') || 'application/octet-stream';
    if (requestedFilename.endsWith('.mp4')) {
      contentType = 'video/mp4';
    } else if (requestedFilename.endsWith('.mp3')) {
      contentType = 'audio/mpeg';
    } else if (requestedFilename.endsWith('.jpg') || requestedFilename.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (requestedFilename.endsWith('.png')) {
      contentType = 'image/png';
    }

    // Handle HEAD request (pre-flight checks from mobile download managers)
    if (req.method === 'HEAD') {
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Accept-Ranges', 'bytes');
      const upstreamLength = mediaResponse.headers.get('content-length');
      if (upstreamLength) res.setHeader('Content-Length', upstreamLength);
      res.status(200).end();
      return;
    }

    // DIRECT STREAMING PIPELINE:
    // Sends HTTP headers immediately so Time-To-First-Byte is < 200ms.
    if (mediaResponse.body) {
      try {
        res.setHeader('Content-Type', contentType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`
        );
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, X-Content-Length, Content-Disposition');

        const upstreamLength = mediaResponse.headers.get('content-length');
        const contentEncoding = mediaResponse.headers.get('content-encoding');
        // Only set Content-Length if there is no content encoding (like gzip)
        // because Node fetch decompresses automatically, which would cause a Content-Length mismatch
        if (!contentEncoding && upstreamLength && Number(upstreamLength) > 0) {
          res.setHeader('Content-Length', upstreamLength);
          res.setHeader('X-Content-Length', upstreamLength);
        }

        const isRangeRequest = Boolean(req.headers.range);
        res.setHeader('Accept-Ranges', 'bytes');
        if (isRangeRequest && mediaResponse.status === 206) {
          res.status(206);
          const cr = mediaResponse.headers.get('content-range');
          if (cr) res.setHeader('Content-Range', cr);
        } else {
          res.status(200);
        }

        // Ngắt stream ngay nếu client hủy kết nối giữa chừng để giải phóng socket và RAM
        req.on('close', () => {
          if (!res.writableEnded) {
            res.end();
          }
        });

        const streamToPipe =
          typeof (mediaResponse.body as any)?.getReader === 'function'
            ? Readable.fromWeb(mediaResponse.body as any)
            : mediaResponse.body;
        await pipeline(streamToPipe as any, res);
        return;
      } catch (streamErr: any) {
        if (streamErr?.code !== 'ERR_STREAM_PREMATURE_CLOSE' && streamErr?.name !== 'AbortError') {
          console.warn('Stream pipeline closed:', streamErr?.message || streamErr);
        }
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
    } else {
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: 'Luồng dữ liệu không khả dụng từ máy chủ nguồn.',
          message: 'Luồng dữ liệu không khả dụng từ máy chủ nguồn.',
        });
      } else if (!res.writableEnded) {
        res.end();
      }
      return;
    }
  } catch (err: any) {
    console.error('Download proxy error:', err);
    if (!res.headersSent) {
      const errMsg = 'Lỗi trong quá trình kết nối tải xuống tệp phương tiện. Vui lòng thử lại sau giây lát.';
      res.status(502).json({
        success: false,
        error: errMsg,
        message: errMsg,
      });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

// Create organized ZIP archive with custom folder hierarchy
app.post('/api/tiktok/bundle-zip', async (req: Request, res: Response) => {
  try {
    const { items, zipName } = req.body as {
      items: Array<{ url: string; relativePath: string }>;
      zipName?: string;
    };

    if (!Array.isArray(items) || items.length === 0) {
      const msg = 'Danh sách tệp tải rỗng';
      res.status(400).json({ success: false, error: msg, message: msg });
      return;
    }

    const zip = new JSZip();
    const finalZipName = (zipName || 'snaptikdou_bundle.zip').replace(/[^\w\d_.-]/gi, '_');

    // Fetch and place each item into its exact folder hierarchy
    const downloadPromises = items.map(async (item) => {
      try {
        const normalizedUrl = normalizeMediaUrl(item.url);
        const isDouyinItem =
          normalizedUrl.includes('zjcdn.com') ||
          normalizedUrl.includes('douyinvod.com') ||
          normalizedUrl.includes('byteimg.com') ||
          normalizedUrl.includes('douyinpic.com') ||
          normalizedUrl.includes('douyinstatic.com') ||
          normalizedUrl.includes('douyin.com') ||
          normalizedUrl.includes('bytedance.com') ||
          normalizedUrl.includes('snssdk.com');

        const fetchRes = await fetchMediaWithRetry(normalizedUrl, { isDouyin: isDouyinItem });

        if (fetchRes && fetchRes.ok) {
          const buffer = await fetchRes.arrayBuffer();
          const normalizedPath = item.relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
          zip.file(normalizedPath, buffer);
        }
      } catch (e) {
        console.warn(`Could not bundle file ${item.relativePath}:`, e);
      }
    });

    await Promise.all(downloadPromises);

    const zipContent = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${finalZipName}"`);
    res.setHeader('Content-Length', zipContent.length.toString());
    res.send(zipContent);
  } catch (error: any) {
    console.error('Bundle zip error:', error);
    const errMsg = error?.message || 'Lỗi khi đóng gói file ZIP';
    res.status(422).json({ success: false, error: errMsg, message: errMsg });
  }
});

// Process-level handlers to prevent container crashes on unexpected socket resets
process.on('unhandledRejection', (reason) => {
  console.warn('Process caught unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Process caught uncaught exception:', err);
});

// Global Express error handler to prevent HTML 500 responses
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('Unhandled server error:', err);
  if (!res.headersSent) {
    const msg = err?.message || 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng thử lại.';
    res.status(500).json({
      success: false,
      error: msg,
      message: msg,
    });
  } else if (!res.writableEnded) {
    res.end();
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Fallback error handler after Vite
  app.use((err: any, _req: Request, res: Response, _next: any) => {
    console.error('Vite / SPA middleware error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err?.message || 'Server error' });
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SnapTikDou server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
