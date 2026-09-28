import { extractCleanUrl, extractBilibiliId, normalizeMediaUrl, TIKTOK_USER_AGENT } from '../constants';
import { smartFetch } from '../network';

export async function extractFromBilibili(bilibiliUrl: string): Promise<any> {
  const cleanUrl = extractCleanUrl(bilibiliUrl) || bilibiliUrl;
  let bvid = extractBilibiliId(cleanUrl);

  let targetUrl = cleanUrl;
  // Nếu là link rút gọn b23.tv, cần resolve URL trước
  if (cleanUrl.includes('b23.tv')) {
    try {
      const res = await smartFetch(cleanUrl, { method: 'GET', redirect: 'follow', timeout: 5000 });
      targetUrl = res.url || cleanUrl;
      bvid = extractBilibiliId(targetUrl);
    } catch {}
  }

  if (!bvid) {
    throw new Error('Không thể trích xuất mã định danh BVID từ liên kết Bilibili.');
  }

  // Gọi API thông tin video chính thức của Bilibili
  const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  const response = await smartFetch(apiUrl, {
    headers: {
      'User-Agent': TIKTOK_USER_AGENT,
      'Referer': `https://www.bilibili.com/video/${bvid}`,
    },
    timeout: 6000,
  });

  if (!response.ok) {
    throw new Error('Không thể kết nối đến máy chủ Bilibili.');
  }

  const json = await response.json();
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message || 'Video Bilibili không tồn tại hoặc đã bị xóa.');
  }

  const viewData = json.data;
  const cid = viewData.cid;

  // Lấy link stream video & audio qua API playurl
  const playUrlApi = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=4048`;
  const playRes = await smartFetch(playUrlApi, {
    headers: {
      'User-Agent': TIKTOK_USER_AGENT,
      'Referer': `https://www.bilibili.com/video/${bvid}`,
    },
    timeout: 6000,
  });

  let videoStreamUrl = '';
  let audioStreamUrl = '';

  if (playRes.ok) {
    const playJson = await playRes.json();
    const dash = playJson.data?.dash;
    if (dash) {
      videoStreamUrl = dash.video?.[0]?.baseUrl || dash.video?.[0]?.backup_url?.[0] || '';
      audioStreamUrl = dash.audio?.[0]?.baseUrl || dash.audio?.[0]?.backup_url?.[0] || '';
    } else {
      videoStreamUrl = playJson.data?.durl?.[0]?.url || '';
    }
  }

  return {
    id: String(viewData.bvid || bvid),
    url: targetUrl,
    title: viewData.title || 'Bilibili Video',
    mediaType: 'video' as const,
    cover: normalizeMediaUrl(viewData.pic),
    duration: viewData.duration || 0,
    createdAt: new Date().toISOString(),
    author: {
      id: String(viewData.owner?.mid || ''),
      uniqueId: viewData.owner?.name || 'bilibili_creator',
      nickname: viewData.owner?.name || 'Bilibili Creator',
      avatar: normalizeMediaUrl(viewData.owner?.face),
    },
    stats: {
      plays: viewData.stat?.view || 0,
      likes: viewData.stat?.like || 0,
      comments: viewData.stat?.reply || 0,
      shares: viewData.stat?.share || 0,
      downloads: viewData.stat?.coin || 0,
    },
    video: {
      noWatermark: normalizeMediaUrl(videoStreamUrl),
      hd: normalizeMediaUrl(videoStreamUrl),
      watermark: '',
      size: 0,
      hdSize: 0,
      backupUrls: [normalizeMediaUrl(videoStreamUrl)].filter(Boolean),
    },
    audio: {
      id: String(cid),
      title: viewData.title || 'Bilibili Audio',
      author: viewData.owner?.name || '',
      url: normalizeMediaUrl(audioStreamUrl),
      duration: viewData.duration || 0,
    },
    images: [],
    platform: 'bilibili' as const,
  };
}
