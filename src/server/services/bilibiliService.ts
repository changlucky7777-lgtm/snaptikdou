import { extractCleanUrl, extractBilibiliId, normalizeMediaUrl, TIKTOK_USER_AGENT } from '../constants';
import { smartFetch } from '../network';

// Lớp 1: Gọi API trực tiếp của Bilibili kèm cookie buvid3
async function extractBilibiliDirectApi(bvid: string, originalUrl: string) {
  try {
    // Lấy cookie buvid3 trước
    const initRes = await smartFetch('https://www.bilibili.com', {
      headers: { 'User-Agent': TIKTOK_USER_AGENT },
      timeout: 4000,
    });
    const setCookie = (initRes.headers as any).getSetCookie?.()?.[0] || initRes.headers.get('set-cookie') || '';
    const buvidMatch = setCookie.match(/buvid3=([^;]+)/);
    const buvid3 = buvidMatch ? buvidMatch[1] : 'INFO_H_123456789';

    const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    const viewRes = await smartFetch(viewUrl, {
      headers: {
        'User-Agent': TIKTOK_USER_AGENT,
        'Referer': `https://www.bilibili.com/video/${bvid}`,
        'Cookie': `buvid3=${buvid3};`,
      },
      timeout: 5000,
    });

    if (!viewRes.ok) return null;
    const viewJson = await viewRes.json();
    if (viewJson.code !== 0 || !viewJson.data) return null;

    const data = viewJson.data;
    const cid = data.cid;

    const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=4048`;
    const playRes = await smartFetch(playUrl, {
      headers: {
        'User-Agent': TIKTOK_USER_AGENT,
        'Referer': `https://www.bilibili.com/video/${bvid}`,
        'Cookie': `buvid3=${buvid3};`,
      },
      timeout: 5000,
    });

    let videoUrl = '';
    let audioUrl = '';
    if (playRes.ok) {
      const playJson = await playRes.json();
      const dash = playJson.data?.dash;
      if (dash) {
        videoUrl = dash.video?.[0]?.baseUrl || dash.video?.[0]?.backup_url?.[0] || '';
        audioUrl = dash.audio?.[0]?.baseUrl || dash.audio?.[0]?.backup_url?.[0] || '';
      } else {
        videoUrl = playJson.data?.durl?.[0]?.url || '';
      }
    }

    if (!videoUrl) return null;

    return {
      id: String(data.bvid || bvid),
      url: originalUrl,
      title: data.title || 'Bilibili Video',
      mediaType: 'video' as const,
      cover: normalizeMediaUrl(data.pic),
      duration: data.duration || 0,
      createdAt: new Date().toISOString(),
      author: {
        id: String(data.owner?.mid || ''),
        uniqueId: data.owner?.name || 'bilibili_creator',
        nickname: data.owner?.name || 'Bilibili Creator',
        avatar: normalizeMediaUrl(data.owner?.face),
      },
      stats: {
        plays: data.stat?.view || 0,
        likes: data.stat?.like || 0,
        comments: data.stat?.reply || 0,
        shares: data.stat?.share || 0,
        downloads: data.stat?.coin || 0,
      },
      video: {
        noWatermark: normalizeMediaUrl(videoUrl),
        hd: normalizeMediaUrl(videoUrl),
        watermark: '',
        size: 0,
        hdSize: 0,
        backupUrls: [normalizeMediaUrl(videoUrl)].filter(Boolean),
      },
      audio: {
        id: String(cid),
        title: data.title || 'Bilibili Audio',
        author: data.owner?.name || '',
        url: normalizeMediaUrl(audioUrl),
        duration: data.duration || 0,
      },
      images: [],
      platform: 'bilibili' as const,
    };
  } catch {
    return null;
  }
}

// Lớp 2: Phân tích HTML SSR từ trang xem video
async function extractBilibiliHtmlSSR(bvid: string, originalUrl: string) {
  try {
    const pageUrl = `https://www.bilibili.com/video/${bvid}`;
    const res = await smartFetch(pageUrl, {
      headers: {
        'User-Agent': TIKTOK_USER_AGENT,
        'Referer': 'https://www.bilibili.com/',
      },
      timeout: 5000,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
    if (!match) return null;

    const state = JSON.parse(match[1]);
    const videoData = state.videoData || state.initialState?.videoData;
    if (!videoData) return null;

    const videoUrl = videoData.pages?.[0]?.first_frame || '';
    return {
      id: String(bvid),
      url: originalUrl,
      title: videoData.title || 'Bilibili Video',
      mediaType: 'video' as const,
      cover: normalizeMediaUrl(videoData.pic),
      duration: videoData.duration || 0,
      createdAt: new Date().toISOString(),
      author: {
        id: String(videoData.owner?.mid || ''),
        uniqueId: videoData.owner?.name || 'bilibili_creator',
        nickname: videoData.owner?.name || 'Bilibili Creator',
        avatar: normalizeMediaUrl(videoData.owner?.face),
      },
      stats: {
        plays: videoData.stat?.view || 0,
        likes: videoData.stat?.like || 0,
        comments: videoData.stat?.reply || 0,
        shares: videoData.stat?.share || 0,
        downloads: videoData.stat?.coin || 0,
      },
      video: {
        noWatermark: normalizeMediaUrl(videoUrl),
        hd: normalizeMediaUrl(videoUrl),
        watermark: '',
        size: 0,
        hdSize: 0,
        backupUrls: [],
      },
      audio: { id: '', title: videoData.title, author: videoData.owner?.name || '', url: '', duration: 0 },
      images: [],
      platform: 'bilibili' as const,
    };
  } catch {
    return null;
  }
}

// Hàm tổng hợp điều phối đa tầng
export async function extractFromBilibili(bilibiliUrl: string): Promise<any> {
  const cleanUrl = extractCleanUrl(bilibiliUrl) || bilibiliUrl;
  let bvid = extractBilibiliId(cleanUrl);
  let targetUrl = cleanUrl;

  if (cleanUrl.includes('b23.tv')) {
    try {
      const res = await smartFetch(cleanUrl, { method: 'GET', redirect: 'follow', timeout: 5000 });
      targetUrl = res.url || cleanUrl;
      bvid = extractBilibiliId(targetUrl);
    } catch {}
  }

  if (!bvid) {
    throw new Error('Không thể tìm thấy mã định danh BVID hợp lệ trong liên kết Bilibili.');
  }

  // Thử lần lượt các tầng
  const layer1 = await extractBilibiliDirectApi(bvid, targetUrl);
  if (layer1) return layer1;

  const layer2 = await extractBilibiliHtmlSSR(bvid, targetUrl);
  if (layer2) return layer2;

  throw new Error('Không thể trích xuất video Bilibili từ tất cả các luồng phân giải.');
}
