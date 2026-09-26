import {
  CLOUDFLARE_WORKER_URL,
  CLOUDFLARE_AUTH_TOKEN,
  DOUYIN_USER_AGENT,
  DOUYIN_WECHAT_UA,
  DOUYIN_MOBILE_USER_AGENT,
  TIKTOK_MOBILE_USER_AGENT,
  CHROME_DESKTOP_CLIENT_HINTS,
  MOBILE_SAFARI_CLIENT_HINTS,
  extractCleanUrl,
  extractDouyinId,
  extractTikTokId,
  isDouyinUrl,
  isTikTokUrl,
  normalizeMediaUrl,
} from '../constants';
import { smartFetch } from '../network';
import { getTtwid, reportInvalidTtwid } from '../ttwidManager';

export async function resolveFinalUrl(rawUrl: string): Promise<string> {
  let currentUrl = extractCleanUrl(rawUrl);

  // BẢO MẬT: Chỉ resolve URL nếu thuộc TikTok hoặc Douyin chính thống
  if (!isDouyinUrl(currentUrl) && !isTikTokUrl(currentUrl)) {
    return currentUrl;
  }

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
        ...MOBILE_SAFARI_CLIENT_HINTS,
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
        if (!isDouyinUrl(currentUrl) && !isTikTokUrl(currentUrl)) {
          return currentUrl;
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

export function formatDouyinAweme(aweme: any, targetUrl: string, awemeId: string) {
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

export async function fetchFromCloudflareWorker(rawUrlOrClean: string) {
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

export async function extractDouyinMobileHtml(awemeId: string, originalUrl: string) {
  const shareUrls = [
    `https://www.iesdouyin.com/share/video/${awemeId}/`,
    `https://www.douyin.com/share/video/${awemeId}/`,
  ];

  for (const sUrl of shareUrls) {
    try {
      const res = await smartFetch(sUrl, {
        headers: {
          'User-Agent': DOUYIN_WECHAT_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...MOBILE_SAFARI_CLIENT_HINTS,
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

export async function extractDouyinNativeApiWarp(awemeId: string, targetUrl: string) {
  try {
    const feedUrl = `https://aweme.snssdk.com/aweme/v1/feed/?aweme_id=${awemeId}&version_name=29.2.0&version_code=290200&device_platform=android&os_version=14`;
    const res = await smartFetch(feedUrl, {
      headers: {
        'User-Agent':
          'com.ss.android.ugc.aweme/290200 (Linux; U; Android 14; zh_CN; Pixel 7; Build/TQ3A.230901.001; Cronet/TTNetVersion:f25deee2 2024-01-10 QuicVersion:463ff2f2 2024-01-09)',
        Accept: 'application/json',
      },
      timeout: 4500,
      useProxy: true,
    });
    if (res.ok) {
      const json = await res.json();
      const aweme =
        json?.aweme_list?.find((item: any) => String(item.aweme_id) === String(awemeId)) ||
        json?.aweme_list?.[0];
      if (aweme && String(aweme.aweme_id) === String(awemeId)) {
        return formatDouyinAweme(aweme, targetUrl, awemeId);
      }
    }
  } catch {}

  try {
    const iesRes = await smartFetch(
      `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${awemeId}`,
      {
        headers: {
          'User-Agent': DOUYIN_WECHAT_UA,
          Referer: 'https://www.iesdouyin.com/',
          Accept: 'application/json, text/plain, */*',
          ...MOBILE_SAFARI_CLIENT_HINTS,
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

  try {
    const ttwid = await getTtwid();
    const detailApiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&device_platform=webapp&version_code=170400&channel=channel_pc_web`;
    const response = await smartFetch(detailApiUrl, {
      headers: {
        'User-Agent': DOUYIN_USER_AGENT,
        ...CHROME_DESKTOP_CLIENT_HINTS,
        Referer: `https://www.douyin.com/video/${awemeId}`,
        Accept: 'application/json, text/plain, */*',
        Cookie: `ttwid=${ttwid};`,
      },
      timeout: 4500,
      useProxy: true,
    });

    if (response.status === 403) {
      reportInvalidTtwid(ttwid);
    }

    if (response.ok) {
      const json = await response.json();
      if (json?.aweme_detail && json.aweme_detail.aweme_id) {
        return formatDouyinAweme(json.aweme_detail, targetUrl, awemeId);
      }
    }
  } catch {}

  return null;
}

export async function extractDouyinMobileSSR(awemeId: string, targetUrl: string) {
  try {
    const pageUrl = `https://www.douyin.com/video/${awemeId}`;
    const ttwid = await getTtwid();
    const pageRes = await smartFetch(pageUrl, {
      headers: {
        'User-Agent': DOUYIN_USER_AGENT,
        ...CHROME_DESKTOP_CLIENT_HINTS,
        Referer: 'https://www.douyin.com/',
        Cookie: `ttwid=${ttwid};`,
      },
      timeout: 4500,
      useProxy: true,
    });

    if (pageRes.status === 403) {
      reportInvalidTtwid(ttwid);
    }

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

export async function extractFromTikWM(targetUrl: string) {
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
          headers: {
            'User-Agent': DOUYIN_USER_AGENT,
            ...CHROME_DESKTOP_CLIENT_HINTS,
          },
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
          'User-Agent': DOUYIN_USER_AGENT,
          ...CHROME_DESKTOP_CLIENT_HINTS,
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
  throw new Error('TikWM không phản giải được link');
}

export async function extractFromDouyin(douyinUrl: string, originalUrl?: string) {
  const cleanUrl = extractCleanUrl(douyinUrl) || douyinUrl;
  let awemeId = extractDouyinId(cleanUrl) || extractDouyinId(douyinUrl);
  let resolvedUrl = originalUrl || cleanUrl;

  if (!awemeId) {
    resolvedUrl = await resolveFinalUrl(cleanUrl);
    awemeId = extractDouyinId(resolvedUrl);
  }

  const targetUrl = resolvedUrl;

  // 1. Worker Edge (Timeout 3.5s)
  try {
    const cfPromise = fetchFromCloudflareWorker(cleanUrl);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3500));
    const cfData = (await Promise.race([cfPromise, timeoutPromise])) as any;
    if (cfData && (cfData.video?.noWatermark || cfData.images?.length > 0)) {
      return cfData;
    }
  } catch {}

  // 2. Native WARP API, WeChat HTML, SSR (Gắn Client Hints)
  if (awemeId) {
    try {
      const warpData = await extractDouyinNativeApiWarp(awemeId, targetUrl);
      if (warpData && (warpData.video?.noWatermark || warpData.images?.length > 0)) {
        return warpData;
      }
    } catch {}

    try {
      const mobileData = await extractDouyinMobileHtml(awemeId, targetUrl);
      if (mobileData && (mobileData.video?.noWatermark || mobileData.images?.length > 0)) {
        return mobileData;
      }
    } catch {}

    try {
      const ssrData = await extractDouyinMobileSSR(awemeId, targetUrl);
      if (ssrData && (ssrData.video?.noWatermark || ssrData.images?.length > 0)) {
        return ssrData;
      }
    } catch {}
  }

  // 3. Fallback TikWM (Có Retry-After Backoff ngầm)
  try {
    const tikwmInput = awemeId ? `https://www.iesdouyin.com/share/video/${awemeId}/` : cleanUrl;
    const tikwmData = await extractFromTikWM(tikwmInput);
    if (
      tikwmData &&
      (tikwmData.play || (Array.isArray(tikwmData.images) && tikwmData.images.length > 0))
    ) {
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
  } catch {}
  return null;
}
