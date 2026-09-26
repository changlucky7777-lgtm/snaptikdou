import zlib from 'zlib';
import { TIKTOK_USER_AGENT, TIKTOK_FEED_HOSTS, normalizeMediaUrl } from '../constants';
import { extractFromTikWM } from './douyinService';

export async function extractTikTokOfficial(videoId: string) {
  for (const host of TIKTOK_FEED_HOSTS) {
    try {
      const feedUrl = `https://${host}/aweme/v1/feed/?aweme_id=${videoId}&version_name=1.1.9&version_code=2018111632&build_number=1.1.9&device_platform=android&os_version=10`;
      const res = await fetch(feedUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'com.zhiliaoapp.musically/300904 (2018111632; U; Android 10; en_US; Pixel 4; Build/QQ3A.200805.001; Cronet/58.0.2991.0)',
          Accept: 'application/json, text/plain, */*',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;
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

export async function extractFromSSSTik(targetUrl: string) {
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

export async function extractFromTikTok(resolvedUrl: string, tiktokId: string | null) {
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

        return {
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

    return {
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
  }

  const sssData = await extractFromSSSTik(resolvedUrl);
  if (sssData && (sssData.video || sssData.images.length > 0)) {
    const isPhotoSlide = sssData.images.length > 0;
    return {
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
  }

  throw new Error('Không tìm thấy thông tin video TikTok. Vui lòng kiểm tra lại liên kết.');
}
