import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import zlib from 'zlib';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createServer as createViteServer } from 'vite';
import JSZip from 'jszip';
import { SocksProxyAgent } from 'socks-proxy-agent';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const CLOUDFLARE_WORKER_URL =
  process.env.CLOUDFLARE_WORKER_URL || 'https://douyin-resolver.changlucky7777.workers.dev';
const CLOUDFLARE_AUTH_TOKEN =
  process.env.WORKER_AUTH_TOKEN || 'k8dF92mZx2026Secure';

const TIKTOK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DOUYIN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DOUYIN_WECHAT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x1800302c) NetType/WIFI Language/zh_CN';
const DOUYIN_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';
const TIKTOK_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';

const WARP_SOCKS_URL = process.env.WARP_PROXY || 'socks5h://127.0.0.1:40000';
let warpAgent: SocksProxyAgent | null = null;
try {
  warpAgent = new SocksProxyAgent(WARP_SOCKS_URL);
} catch {
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
        const single =
          typeof rawHeaders?.get === 'function'
            ? rawHeaders.get('set-cookie')
            : rawHeaders?.['set-cookie'];
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

async function smartFetch(url: string, options: SmartFetchOptions = {}): Promise<SmartResponse> {
  const { useProxy = true, timeout = 10000, ...fetchOpts } = options;

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
    } catch {}
  }

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

function normalizeMediaUrl(
  url: string | undefined | null,
  defaultDomain = 'https://www.tikwm.com'
): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) {
    return 'https:' + trimmed;
  }
  if (trimmed.startsWith('/')) {
    const isDouyin =
      trimmed.includes('aweme') || trimmed.includes('douyin') || defaultDomain.includes('douyin');
    const domain = isDouyin ? 'https://www.douyin.com' : defaultDomain;
    return domain.replace(/\/+$/, '') + trimmed;
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    const isDouyin =
      trimmed.includes('aweme') || trimmed.includes('douyin') || defaultDomain.includes('douyin');
    const domain = isDouyin ? 'https://www.douyin.com' : defaultDomain;
    return domain.replace(/\/+$/, '') + '/' + trimmed;
  }
  return trimmed;
}

function isDouyinUrl(url: string): boolean {
  return /douyin\.com|iesdouyin\.com/i.test(url);
}

function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
}

function extractCleanUrl(rawInput: string): string {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const match = rawInput.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i);
  if (match) {
    return match[0].replace(/[.,;:!?)\]}\u3000-\u303f\uff00-\uffef]+$/, '').trim();
  }
  return rawInput.trim();
}

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

let cachedTtwid = '1%7CdZ5n4L8s2M9v_1x2y3z4k5j6h7g8f9e0d1c2b3a4%7C1789567890%7Cabc123def456';
let cachedTtwidTime = Date.now();

async function getTtwid(): Promise<string> {
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
      timeout: 5000,
      useProxy: true,
    });
    const setCookie = res.headers.getSetCookie?.()?.[0] || res.headers.get('set-cookie') || '';
    const match = setCookie.match(/ttwid=([^;]+)/);
    if (match && match[1]) {
      cachedTtwid = match[1];
      cachedTtwidTime = Date.now();
      return cachedTtwid;
    }
  } catch {}
  return cachedTtwid;
}

async function resolveFinalUrl(rawUrl: string): Promise<string> {
  let currentUrl = extractCleanUrl(rawUrl);
  if (extractDouyinId(currentUrl) || extractTikTokId(currentUrl)) {
    return currentUrl;
  }
  const isDouyin = isDouyinUrl(currentUrl);
  const ttwid = isDouyin ? await getTtwid() : '';

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
        useProxy: true,
      });
      const location = res.headers.get('location');
      if (location && res.status >= 300 && res.status < 400) {
        if (location.startsWith('http')) {
          currentUrl = location;
        } else {
          currentUrl = new URL(location, currentUrl).toString();
        }
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

async function fetchFromCloudflareWorker(rawUrlOrClean: string) {
  const cleanUrl = extractCleanUrl(rawUrlOrClean) || rawUrlOrClean;
  try {
    const res = await fetch(CLOUDFLARE_WORKER_URL.replace(/\/$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': CLOUDFLARE_AUTH_TOKEN,
      },
      body: JSON.stringify({ url: cleanUrl }),
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const json = (await res.json()) as any;
      const detail = json.aweme_detail || json.data?.aweme_detail || json.data;
      const awemeId = String(json.awemeId || detail?.aweme_id || extractDouyinId(cleanUrl) || '');
      if (detail && (detail.aweme_id || detail.video || detail.images || awemeId)) {
        return formatDouyinAweme(detail, cleanUrl, awemeId);
      }
      if (json.video?.noWatermark) {
        return json;
      }
    }
  } catch {}
  return null;
}

function formatDouyinAweme(aweme: any, targetUrl: string, awemeId: string) {
  const isPhotos = Array.isArray(aweme.images) && aweme.images.length > 0;
  const mediaType: 'video' | 'photos' = isPhotos ? 'photos' : 'video';

  const images: string[] = [];
  if (isPhotos) {
    for (const img of aweme.images) {
      const bestUrl = img.url_list?.[0] || img.download_url_list?.[0];
      if (bestUrl) {
        images.push(bestUrl);
      }
    }
  }

  const pickBestDouyinStreamUrl = (
    urlList: string[] | undefined | null
  ): { primary: string; directCdn: string; sanitizedPlay: string; allUrls: string[] } => {
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
      if (
        !directCdn &&
        /douyinvod\.com|zjcdn\.com|byteimg\.com|snssdk\.com\/video\/tos|ixigua\.com|pstatp\.com/i.test(
          trimmed
        )
      ) {
        directCdn = trimmed;
      }
    }
    const rawPlayUrl =
      urlList.find((u) => u && (u.includes('playwm') || u.includes('/play/'))) || urlList[0] || '';
    const sanitizedPlay = rawPlayUrl
      ? rawPlayUrl.replace('/playwm/', '/play/').replace(/playwm/g, 'play')
      : '';
    if (sanitizedPlay && !allUrls.includes(sanitizedPlay)) {
      allUrls.push(sanitizedPlay);
    }
    const primary = directCdn || sanitizedPlay || urlList[0] || '';
    return { primary, directCdn, sanitizedPlay, allUrls };
  };

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
    if (Array.isArray(aweme.video.bit_rate) && aweme.video.bit_rate.length > 0) {
      const sorted = [...aweme.video.bit_rate].sort(
        (a: any, b: any) => (b.bit_rate || 0) - (a.bit_rate || 0)
      );
      const topBitrate = sorted[0];
      if (topBitrate?.play_addr?.url_list) {
        const picked = pickBestDouyinStreamUrl(topBitrate.play_addr.url_list);
        hdVideo = picked.primary;
        hdVideoSize = topBitrate.play_addr.data_size || 0;
        watermarkVideo = topBitrate.play_addr.url_list[0] || '';
        picked.allUrls.forEach(addBackup);
      }
      const normalBitrate =
        sorted.find(
          (b: any) => b.gear_name?.includes('720') || b.gear_name?.includes('540')
        ) || (sorted.length > 1 ? sorted[sorted.length - 1] : sorted[0]);
      if (normalBitrate?.play_addr?.url_list) {
        const picked = pickBestDouyinStreamUrl(normalBitrate.play_addr.url_list);
        noWatermarkVideo = picked.primary;
        videoSize = normalBitrate.play_addr.data_size || 0;
        picked.allUrls.forEach(addBackup);
      }
      for (const b of sorted) {
        if (b.play_addr?.url_list) {
          b.play_addr.url_list.forEach(addBackup);
        }
        if (b.play_addr_265?.url_list) {
          b.play_addr_265.url_list.forEach(addBackup);
        }
      }
    }

    if (aweme.video.play_addr_h264?.url_list) {
      const picked = pickBestDouyinStreamUrl(aweme.video.play_addr_h264.url_list);
      if (!noWatermarkVideo) {
        noWatermarkVideo = picked.primary;
        videoSize = aweme.video.play_addr_h264.data_size || 0;
      }
      picked.allUrls.forEach(addBackup);
    }

    if (aweme.video.play_addr?.url_list) {
      const picked = pickBestDouyinStreamUrl(aweme.video.play_addr.url_list);
      if (!noWatermarkVideo) {
        noWatermarkVideo = picked.primary;
        videoSize = aweme.video.play_addr.data_size || 0;
      }
      picked.allUrls.forEach(addBackup);
    }

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

  const audioUrl = aweme.music?.play_url?.url_list?.[0] || '';
  const audioTitle = aweme.music?.title || 'Douyin Audio';
  const audioAuthor = aweme.music?.author || aweme.author?.nickname || 'Douyin Creator';
  const audioDuration = aweme.music?.duration || 0;

  const coverUrl =
    aweme.video?.origin_cover?.url_list?.[0] ||
    aweme.video?.cover?.url_list?.[0] ||
    aweme.video?.dynamic_cover?.url_list?.[0] ||
    images[0] ||
    '';

  const durationSec = aweme.video?.duration ? Math.round(aweme.video.duration / 1000) : 0;

  return {
    id: String(aweme.aweme_id || awemeId),
    url: targetUrl,
    title: aweme.desc || 'Douyin Media',
    mediaType,
    cover: coverUrl,
    duration: durationSec,
    createdAt: aweme.create_time
      ? new Date(aweme.create_time * 1000).toISOString()
      : new Date().toISOString(),
    author: {
      id: String(aweme.author?.uid || aweme.author?.sec_uid || ''),
      uniqueId: aweme.author?.unique_id || aweme.author?.short_id || 'douyin_user',
      nickname: aweme.author?.nickname || 'Douyin Creator',
      avatar:
        aweme.author?.avatar_thumb?.url_list?.[0] ||
        aweme.author?.avatar_medium?.url_list?.[0] ||
        '',
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

// Bóc tách qua Mobile Share HTML dùng User-Agent WeChat (không bị chặn Captcha)
async function extractDouyinMobileHtml(awemeId: string, originalUrl: string) {
  const shareUrls = [
    `https://www.iesdouyin.com/share/video/${awemeId}/`,
    `https://www.douyin.com/share/video/${awemeId}/`,
  ];
  for (const sUrl of shareUrls) {
    try {
      const res = await smartFetch(sUrl, {
        headers: {
          'User-Agent': DOUYIN_WECHAT_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        timeout: 4500,
        useProxy: true,
      });
      if (!res.ok) continue;
      const html = await res.text();
      const match =
        html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/) ||
        html.match(/_ROUTER_DATA\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
      let item: any = null;
      if (match) {
        try {
          const rData = JSON.parse(match[1]);
          const loader = rData.loaderData || {};
          const key =
            Object.keys(loader).find((k) => k.includes('video') || k.includes('note')) ||
            Object.keys(loader)[0];
          item = loader[key]?.videoInfoRes?.item_list?.[0];
        } catch {}
      }
      if (item && item.aweme_id) {
        return formatDouyinAweme(item, originalUrl, String(item.aweme_id));
      }
    } catch {}
  }
  return null;
}

// Native ByteDance Feed V1 & Detail API qua WARP
async function extractDouyinNativeApiWarp(awemeId: string, targetUrl: string) {
  // 1. Aweme Snssdk Mobile Feed API (Rất ổn định, không kiểm tra chữ ký nặng)
  try {
    const feedUrl = `https://aweme.snssdk.com/aweme/v1/feed/?aweme_id=${awemeId}&version_name=29.2.0&version_code=290200&device_platform=android&os_version=14`;
    const res = await smartFetch(feedUrl, {
      headers: {
        'User-Agent': 'com.ss.android.ugc.aweme/290200 (Linux; U; Android 14; zh_CN; Pixel 7; Build/TQ3A.230901.001; Cronet/TTNetVersion:f25deee2 2024-01-10 QuicVersion:463ff2f2 2024-01-09)',
        'Accept': 'application/json',
      },
      timeout: 4500,
      useProxy: true,
    });
    if (res.ok) {
      const json = await res.json();
      const aweme = json?.aweme_list?.find((item: any) => String(item.aweme_id) === String(awemeId)) || json?.aweme_list?.[0];
      if (aweme && String(aweme.aweme_id) === String(awemeId)) {
        return formatDouyinAweme(aweme, targetUrl, awemeId);
      }
    }
  } catch {}

  // 2. ies iteminfo API qua WARP
  try {
    const iesRes = await smartFetch(
      `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${awemeId}`,
      {
        headers: {
          'User-Agent': DOUYIN_WECHAT_UA,
          'Referer': 'https://www.iesdouyin.com/',
          'Accept': 'application/json, text/plain, */*',
        },
        timeout: 4500,
        useProxy: true,
      }
    );
    if (iesRes.ok) {
      const iesJson = await iesRes.json();
      if (iesJson?.item_list?.[0]) {
        return formatDouyinAweme(iesJson.item_list[0], targetUrl, awemeId);
      }
    }
  } catch {}

  // 3. Web Detail API với ttwid
  try {
    const ttwid = await getTtwid();
    const detailApiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&device_platform=webapp&version_code=170400&channel=channel_pc_web`;
    const response = await smartFetch(detailApiUrl, {
      headers: {
        'User-Agent': DOUYIN_USER_AGENT,
        'Referer': `https://www.douyin.com/video/${awemeId}`,
        'Accept': 'application/json, text/plain, */*',
        'Cookie': `ttwid=${ttwid};`,
      },
      timeout: 4500,
      useProxy: true,
    });
    if (response.ok) {
      const json = await response.json();
      if (json?.aweme_detail && json.aweme_detail.aweme_id) {
        return formatDouyinAweme(json.aweme_detail, targetUrl, awemeId);
      }
    }
  } catch {}

  return null;
}

// Bóc tách SSR JSON nhúng
async function extractDouyinMobileSSR(awemeId: string, targetUrl: string) {
  try {
    const pageUrl = `https://www.douyin.com/video/${awemeId}`;
    const ttwid = await getTtwid();
    const pageRes = await smartFetch(pageUrl, {
      headers: {
        'User-Agent': DOUYIN_USER_AGENT,
        'Referer': 'https://www.douyin.com/',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cookie': `ttwid=${ttwid};`,
      },
      timeout: 4500,
      useProxy: true,
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const renderMatch = html.match(
        /<script id="RENDER_DATA" type="application\/json">([\s\S]*?)<\/script>/
      );
      if (renderMatch && renderMatch[1]) {
        const decoded = decodeURIComponent(renderMatch[1].trim());
        const parsed = JSON.parse(decoded);
        const detail =
          parsed?.appContext?._state?.awemeDetail ||
          parsed?.[`video_(${awemeId})/page`]?.videoInfoRes?.item_list?.[0] ||
          (
            Object.values(parsed || {}).find(
              (v: any) => v?.videoInfoRes?.item_list?.[0]
            ) as any
          )?.videoInfoRes?.item_list?.[0];
        if (detail) {
          return formatDouyinAweme(detail, targetUrl, awemeId);
        }
      }
    }
  } catch {}
  return null;
}

async function extractFromDouyin(douyinUrl: string, originalUrl?: string) {
  const cleanUrl = extractCleanUrl(douyinUrl) || douyinUrl;
  console.log(`[DOUYIN] Bắt đầu xử lý link: ${cleanUrl}`);

  let awemeId = extractDouyinId(cleanUrl) || extractDouyinId(douyinUrl);
  let resolvedUrl = originalUrl || cleanUrl;

  if (!awemeId) {
    resolvedUrl = await resolveFinalUrl(cleanUrl);
    awemeId = extractDouyinId(resolvedUrl);
  }

  const targetUrl = resolvedUrl;
  console.log(`[DOUYIN] Aweme ID nhận diện: ${awemeId || 'Chưa tìm thấy'}`);

  // 1. Thử Cloudflare Worker Edge (Timeout 3.5s)
  try {
    console.log('[DOUYIN] Đang thử Tầng 1 (Worker Edge)...');
    const cfPromise = fetchFromCloudflareWorker(cleanUrl);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3500));
    const cfData = (await Promise.race([cfPromise, timeoutPromise])) as any;
    if (cfData && (cfData.video?.noWatermark || cfData.images?.length > 0)) {
      console.log('[DOUYIN Thành công] Tầng 1 (Worker) đã giải mã thành công!');
      return cfData;
    }
  } catch {}

  // 2. Tầng WARP Native API & Mobile HTML/SSR
  if (awemeId) {
    try {
      console.log('[DOUYIN] Đang thử Tầng 2.1 (WARP Native API)...');
      const warpData = await extractDouyinNativeApiWarp(awemeId, targetUrl);
      if (warpData && (warpData.video?.noWatermark || warpData.images?.length > 0)) {
        console.log('[DOUYIN Thành công] Tầng 2.1 (WARP Native API) đã giải mã!');
        return warpData;
      }
    } catch {}

    try {
      console.log('[DOUYIN] Đang thử Tầng 2.2 (WARP WeChat Mobile HTML)...');
      const mobileData = await extractDouyinMobileHtml(awemeId, targetUrl);
      if (mobileData && (mobileData.video?.noWatermark || mobileData.images?.length > 0)) {
        console.log('[DOUYIN Thành công] Tầng 2.2 (WARP WeChat HTML) đã giải mã!');
        return mobileData;
      }
    } catch {}

    try {
      console.log('[DOUYIN] Đang thử Tầng 2.3 (WARP Mobile SSR)...');
      const ssrData = await extractDouyinMobileSSR(awemeId, targetUrl);
      if (ssrData && (ssrData.video?.noWatermark || ssrData.images?.length > 0)) {
        console.log('[DOUYIN Thành công] Tầng 2.3 (WARP Mobile SSR) đã giải mã!');
        return ssrData;
      }
    } catch {}
  }

  // 3. Fallback TikWM (Thử cả 2 dạng: URL gốc và URL www.iesdouyin.com/share/video/ID/)
  try {
    console.log('[DOUYIN] Đang thử Tầng 3 (TikWM Fallback)...');
    const tikwmInput = awemeId ? `https://www.iesdouyin.com/share/video/${awemeId}/` : cleanUrl;
    const tikwmData = await extractFromTikWM(tikwmInput);
    if (
      tikwmData &&
      (tikwmData.play || (Array.isArray(tikwmData.images) && tikwmData.images.length > 0))
    ) {
      console.log('[DOUYIN Thành công] Tầng 3 (TikWM) đã giải mã!');
      const isPhotos = Array.isArray(tikwmData.images) && tikwmData.images.length > 0;
      return {
        id: String(tikwmData.id || awemeId || Date.now()),
        url: targetUrl,
        title: tikwmData.title || 'Douyin Media',
        mediaType: (isPhotos ? 'photos' : 'video') as 'photos' | 'video',
        cover: normalizeMediaUrl(tikwmData.cover || tikwmData.origin_cover),
        duration: tikwmData.duration || 0,
        createdAt: tikwmData.create_time
          ? new Date(tikwmData.create_time * 1000).toISOString()
          : new Date().toISOString(),
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
        images: isPhotos ? (tikwmData.images || []).map((img: string) => normalizeMediaUrl(img)) : [],
        platform: 'douyin' as const,
      };
    }
  } catch (e: any) {
    console.warn(`[DOUYIN] Tầng 3 TikWM lỗi: ${e?.message}`);
  }

  console.error('[DOUYIN Thất bại toàn bộ] Tất cả các tầng cào đều không lấy được dữ liệu.');
  return null;
}

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
        signal: AbortSignal.timeout(5000),
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
        (aweme.video?.play_addr ||
          (aweme.image_post_info?.images && aweme.image_post_info.images.length > 0))
      ) {
        return aweme;
      }
    } catch {}
  }
  return null;
}

async function extractFromSSSTik(targetUrl: string) {
  try {
    let cleanUrl = targetUrl;
    try {
      const parsed = new URL(targetUrl);
      if (parsed.pathname.includes('/video/') || parsed.pathname.includes('/photo/')) {
        cleanUrl = `${parsed.origin}${parsed.pathname}`;
      }
    } catch {}
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
      signal: AbortSignal.timeout(6000),
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
  } catch {}
  return null;
}

async function extractFromTikWM(targetUrl: string) {
  let cleanUrl = targetUrl;
  try {
    const parsed = new URL(targetUrl);
    if (parsed.pathname.includes('/video/') || parsed.pathname.includes('/photo/')) {
      cleanUrl = `${parsed.origin}${parsed.pathname}`;
    }
  } catch {}

  const urlsToTry = [cleanUrl];
  if (cleanUrl !== targetUrl) {
    urlsToTry.push(targetUrl);
  }

  for (const url of urlsToTry) {
    try {
      const getRes = await smartFetch(
        `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
        {
          headers: { 'User-Agent': TIKTOK_USER_AGENT },
          timeout: 6000,
        }
      );
      if (getRes.ok) {
        const json = (await getRes.json()) as any;
        if (json && json.code === 0 && json.data) {
          return json.data;
        }
      }
    } catch {}

    try {
      const response = await smartFetch('https://www.tikwm.com/api/', {
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
        timeout: 6000,
      });
      if (response.ok) {
        const json = (await response.json()) as any;
        if (json && json.code === 0 && json.data) {
          return json.data;
        }
      }
    } catch {}
  }
  throw new Error('TikWM không phân giải được link');
}

app.post('/api/tiktok/extract', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    console.log(`\n==============================================`);
    console.log(`[EXTRACT REQUEST] Nhận link từ giao diện: "${url}"`);

    if (!url || typeof url !== 'string') {
      res
        .status(400)
        .json({ success: false, message: 'Vui lòng cung cấp link TikTok hoặc Douyin hợp lệ' });
      return;
    }
    const trimmedUrl = url.trim();
    const cleanTargetUrl = extractCleanUrl(trimmedUrl);
    console.log(`[EXTRACT CLEAN URL]: "${cleanTargetUrl}"`);

    const isDouyin = isDouyinUrl(cleanTargetUrl) || isDouyinUrl(trimmedUrl);
    const isTikTok = isTikTokUrl(cleanTargetUrl) || isTikTokUrl(trimmedUrl);

    if (!isDouyin && !isTikTok) {
      const hasDouyin = /douyin\.com|iesdouyin\.com/.test(trimmedUrl);
      const hasTikTok = /tiktok\.com/.test(trimmedUrl);
      if (!hasDouyin && !hasTikTok) {
        res.status(400).json({
          success: false,
          message: 'URL không thuộc TikTok hoặc Douyin. Vui lòng kiểm tra lại liên kết.',
        });
        return;
      }
    }

    const resolvedUrl = await resolveFinalUrl(cleanTargetUrl || trimmedUrl);
    const targetIsDouyin =
      isDouyinUrl(resolvedUrl) || isDouyinUrl(cleanTargetUrl) || isDouyinUrl(trimmedUrl);

    if (targetIsDouyin) {
      const douyinData = await extractFromDouyin(cleanTargetUrl || trimmedUrl, resolvedUrl);
      if (douyinData && (douyinData.video?.noWatermark || douyinData.images?.length > 0)) {
        console.log(`[EXTRACT THÀNH CÔNG] Đã trả dữ liệu Douyin về client!`);
        return res.json({ success: true, data: douyinData });
      }
      console.error(`[EXTRACT THẤT BẠI] Không bóc tách được bài viết Douyin!`);
      return res.status(422).json({
        success: false,
        message:
          'Không thể trích xuất video/bài viết Douyin. Vui lòng kiểm tra lại liên kết hoặc thử lại sau vài giây.',
      });
    }

    // TikTok Pipeline
    try {
      const tiktokId = extractTikTokId(resolvedUrl) || extractTikTokId(trimmedUrl);
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
            return res.json({ success: true, data: result });
          }
        } catch {}
      }

      let data: any = null;
      try {
        data = await extractFromTikWM(resolvedUrl);
      } catch {}

      if (
        data &&
        (!tiktokId || !data.id || String(data.id) === String(tiktokId)) &&
        (data.play || (Array.isArray(data.images) && data.images.length > 0))
      ) {
        const isPhotoSlide = Array.isArray(data.images) && data.images.length > 0;
        const mediaType = isPhotoSlide ? 'photos' : 'video';
        let rawAudioUrl = '';
        if (
          data.music_info?.play &&
          typeof data.music_info.play === 'string' &&
          data.music_info.play.startsWith('http')
        ) {
          rawAudioUrl = data.music_info.play;
        } else if (
          isPhotoSlide &&
          data.play &&
          typeof data.play === 'string' &&
          data.play.startsWith('http')
        ) {
          rawAudioUrl = data.play;
        } else if (data.music && typeof data.music === 'string' && data.music.startsWith('http')) {
          rawAudioUrl = data.music;
        } else {
          rawAudioUrl = normalizeMediaUrl(
            data.music || data.music_info?.play || (isPhotoSlide ? data.play : '')
          );
        }

        const result = {
          id: String(data.id || tiktokId || Date.now()),
          url: resolvedUrl,
          title: data.title || 'TikTok Media',
          mediaType,
          cover: normalizeMediaUrl(data.cover || data.origin_cover),
          duration: data.duration || 0,
          createdAt: data.create_time
            ? new Date(data.create_time * 1000).toISOString()
            : new Date().toISOString(),
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
        return res.json({ success: true, data: result });
      }

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
          return res.json({ success: true, data: result });
        }
      } catch {}

      throw new Error('Không tìm thấy thông tin video TikTok. Vui lòng kiểm tra lại liên kết.');
    } catch (primaryError: any) {
      const msg =
        primaryError?.message || 'Lỗi khi trích xuất thông tin media. Vui lòng kiểm tra lại link.';
      res.status(422).json({ success: false, error: msg, message: msg });
      return;
    }
  } catch (error: any) {
    const msg = error?.message || 'Lỗi khi trích xuất thông tin media. Vui lòng kiểm tra lại link.';
    res.status(422).json({ success: false, error: msg, message: msg });
  }
});

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
  if (warpAgent) {
    try {
      const res = await (fetch as any)(url, {
        ...fetchOptions,
        dispatcher: warpAgent,
        agent: warpAgent,
      });
      clearTimeout(timer);
      return res;
    } catch {}
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
      if (ttwid) {
        cookieHeader = `ttwid=${ttwid};`;
      }
    } catch {}
  }

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
        if (
          res.status === 301 ||
          res.status === 302 ||
          res.status === 303 ||
          res.status === 307 ||
          res.status === 308
        ) {
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
    const isCdnUrl =
      /douyinvod\.com|zjcdn\.com|byteimg\.com|snssdk\.com|ixigua\.com|pstatp\.com/i.test(candidate);
    const candidateCookie = isCdnUrl ? '' : cookieHeader;

    if (isCdnUrl) {
      try {
        const headers: Record<string, string> = {
          'User-Agent': DOUYIN_USER_AGENT,
          Accept: '*/*',
        };
        if (options.range) headers['Range'] = options.range;
        const res = await fetchWithConnectTimeout(
          candidate,
          { method: 'GET', headers, redirect: 'follow' },
          15000
        );
        if (isValidMediaResponse(res)) return res;
      } catch {}
    }

    try {
      const headers: Record<string, string> = {
        'User-Agent': userAgent,
        Accept: '*/*',
      };
      if (!isCdnUrl) headers['Referer'] = referer;
      if (candidateCookie) headers['Cookie'] = candidateCookie;
      if (options.range) headers['Range'] = options.range;
      const res = await followAndFetch(candidate, headers, 8);
      if (res) return res;
    } catch {}

    try {
      const headers: Record<string, string> = {
        'User-Agent': userAgent,
        Accept: '*/*',
      };
      if (options.range) headers['Range'] = options.range;
      const res = await followAndFetch(candidate, headers, 8);
      if (res) return res;
    } catch {}

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
    } catch {}

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
    } catch {}
  }
  return null;
}

app.get('/api/tiktok/stream-redirect', (req: Request, res: Response) => {
  const rawUrl = String(req.query.url || '').trim();
  const filename = String(req.query.filename || 'media.mp4').trim();
  if (!rawUrl) {
    res.status(400).send('Thiếu liên kết');
    return;
  }
  const downloadUrl = `/api/tiktok/download?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}`;
  res.redirect(302, downloadUrl);
});

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
      res.status(400).json({ success: false, error: 'Thiếu tham số liên kết' });
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

    let mediaResponse: globalThis.Response | null = null;
    if (rawUrl) {
      mediaResponse = await fetchMediaWithRetry(rawUrl, { isDouyin, range: requestedRange });
    }

    if (!isValidMediaResponse(mediaResponse) && fallbackUrl && fallbackUrl !== rawUrl) {
      mediaResponse = await fetchMediaWithRetry(fallbackUrl, { isDouyin, range: requestedRange });
    }

    if (!isValidMediaResponse(mediaResponse) && backupUrls.length > 0) {
      for (const backup of backupUrls.slice(0, 5)) {
        if (backup && backup !== rawUrl && backup !== fallbackUrl) {
          mediaResponse = await fetchMediaWithRetry(backup, { isDouyin, range: requestedRange });
          if (isValidMediaResponse(mediaResponse)) break;
        }
      }
    }

    if (!isValidMediaResponse(mediaResponse) && postUrl) {
      try {
        if (isDouyin) {
          const freshData = await extractFromDouyin(postUrl, postUrl);
          if (freshData) {
            const freshUrl = requestedFilename.endsWith('.mp3')
              ? freshData.audio?.url
              : freshData.video?.hd || freshData.video?.noWatermark;
            if (freshUrl) {
              mediaResponse = await fetchMediaWithRetry(freshUrl, {
                isDouyin: true,
                range: requestedRange,
              });
            }
          }
        }
      } catch {}
    }

    if (!isValidMediaResponse(mediaResponse) || !mediaResponse) {
      const errMsg =
        'Máy chủ nguồn tạm chặn luồng tải. Vui lòng thử lại sau vài giây hoặc dùng link tải trực tiếp.';
      res.status(502).json({ success: false, fallbackToDirect: true, error: errMsg, message: errMsg });
      return;
    }

    const safeFilename =
      requestedFilename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\;]/g, '_').trim() ||
      'media.mp4';
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
        res.setHeader(
          'Access-Control-Expose-Headers',
          'Content-Length, X-Content-Length, Content-Disposition'
        );

        const upstreamLength = mediaResponse.headers.get('content-length');
        const contentEncoding = mediaResponse.headers.get('content-encoding');
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
          error: 'Luồng dữ liệu không hợp lệ từ máy chủ nguồn.',
          message: 'Luồng dữ liệu không hợp lệ từ máy chủ nguồn.',
        });
      } else if (!res.writableEnded) {
        res.end();
      }
      return;
    }
  } catch (err: any) {
    if (!res.headersSent) {
      const errMsg = 'Lỗi trong quá trình tải xuống tập tin phương tiện.';
      res.status(502).json({ success: false, error: errMsg, message: errMsg });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

app.post('/api/tiktok/bundle-zip', async (req: Request, res: Response) => {
  try {
    const { items, zipName } = req.body as {
      items: Array<{ url: string; relativePath: string }>;
      zipName?: string;
    };
    if (!Array.isArray(items) || items.length === 0) {
      const msg = 'Danh sách tệp trống';
      res.status(400).json({ success: false, error: msg, message: msg });
      return;
    }
    const zip = new JSZip();
    const finalZipName = (zipName || 'snaptikdou_bundle.zip').replace(/[^\w\d_.-]/gi, '_');

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
    const errMsg = error?.message || 'Lỗi khi đóng gói file ZIP';
    res.status(422).json({ success: false, error: errMsg, message: errMsg });
  }
});

process.on('unhandledRejection', (reason) => {
  console.warn('Process caught unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Process caught uncaught exception:', err);
});

app.use((err: any, _req: Request, res: Response, _next: any) => {
  if (!res.headersSent) {
    const msg = err?.message || 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại.';
    res.status(500).json({ success: false, error: msg, message: msg });
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

  app.use((err: any, _req: Request, res: Response, _next: any) => {
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
