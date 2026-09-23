import { smartFetch } from './network';
import { DOUYIN_USER_AGENT } from './constants';

let cachedTtwid = '1%7CdZ5n4L8s2M9v_1x2y3z4k5j6h7g8f9e0d1c2b3a4%7C1789567890%7Cabc123def456';
let cachedTtwidTime = Date.now();

export async function getTtwid(): Promise<string> {
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
