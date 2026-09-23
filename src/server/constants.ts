export const CLOUDFLARE_WORKER_URL =
  process.env.CLOUDFLARE_WORKER_URL || 'https://douyin-resolver.changlucky7777.workers.dev';
export const CLOUDFLARE_AUTH_TOKEN =
  process.env.WORKER_AUTH_TOKEN || '';

export const TIKTOK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
export const DOUYIN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
export const DOUYIN_WECHAT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x1800302c) NetType/WIFI Language/zh_CN';
export const DOUYIN_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';
export const TIKTOK_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';

export const WARP_SOCKS_URL = process.env.WARP_PROXY || 'socks5h://127.0.0.1:40000';

export const TIKTOK_FEED_HOSTS = [
  'api19-normal-useast5.tiktokv.us',
  'api16-normal-useast5.tiktokv.us',
  'api16-normal-c-useast1a.tiktokv.com',
  'api16-va.tiktokv.com',
];

export function isDouyinUrl(url: string): boolean {
  return /douyin\.com|iesdouyin\.com/i.test(url);
}

export function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
}

export function extractCleanUrl(rawInput: string): string {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const match = rawInput.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i);
  if (match) {
    return match[0].replace(/[.,;:!?)\]}\u3000-\u303f\uff00-\uffef]+$/, '').trim();
  }
  return rawInput.trim();
}

export function extractDouyinId(urlOrText: string): string | null {
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

export function extractTikTokId(urlOrText: string): string | null {
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

export function normalizeMediaUrl(
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
    return domain.replace(/\/+$/, '') + '/' + trimmed.replace(/^\/+/, '');
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    const isDouyin =
      trimmed.includes('aweme') || trimmed.includes('douyin') || defaultDomain.includes('douyin');
    const domain = isDouyin ? 'https://www.douyin.com' : defaultDomain;
    return domain.replace(/\/+$/, '') + '/' + trimmed.replace(/^\/+/, '');
  }
  return trimmed;
}
