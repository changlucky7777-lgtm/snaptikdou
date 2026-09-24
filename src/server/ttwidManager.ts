import { smartFetch, parseRetryAfter } from './network';
import { DOUYIN_USER_AGENT, CHROME_DESKTOP_CLIENT_HINTS } from './constants';

interface CachedCookieItem {
  value: string;
  createdAt: number;
  failsCount: number;
}

const TARGET_POOL_SIZE = 6;
const COOKIE_TTL_MS = 6 * 3600 * 1000; // 6 giờ sống

const SEED_COOKIES: string[] = [
  '1%7CdZ5n4L8s2M9v_1x2y3z4k5j6h7g8f9e0d1c2b3a4%7C1789567890%7Cabc123def456',
  '1%7CkB8m2X9q1Z5p_3w4e5r6t7y8u9i0o1p2a3s4d5f6%7C1789567891%7Cdef456abc123',
  '1%7CjN3v7L2w9K0m_5t6y7u8i9o0p1a2s3d4f5g6h7j8%7C1789567892%7C789abc123def',
];

const cookiePool: CachedCookieItem[] = SEED_COOKIES.map((val) => ({
  value: val,
  createdAt: Date.now(),
  failsCount: 0,
}));

let roundRobinIndex = 0;
let isRefilling = false;
let refillCooldownUntil = 0; // Thời điểm hết cooldown nếu bị ByteDance rate-limit

// Hàm xin 1 cookie ttwid mới từ ByteDance Edge có gắn Client Hints chuẩn
async function fetchFreshTtwidFromByteDance(): Promise<string | null> {
  if (Date.now() < refillCooldownUntil) {
    return null; // Đang trong thời gian hạ nhiệt, không gửi thêm request
  }

  try {
    const res = await smartFetch('https://ttwid.bytedance.com/ttwid/union/register/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': DOUYIN_USER_AGENT,
        ...CHROME_DESKTOP_CLIENT_HINTS,
        Origin: 'https://www.douyin.com',
        Referer: 'https://www.douyin.com/',
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

    if (res.status === 429 || res.status === 503) {
      const retryAfterVal = res.headers.get('retry-after');
      const waitMs = parseRetryAfter(retryAfterVal) || 15000;
      refillCooldownUntil = Date.now() + Math.min(60000, Math.max(10000, waitMs));
      return null;
    }

    const setCookie = (res.headers as any).getSetCookie?.()?.[0] || res.headers.get('set-cookie') || '';
    const match = setCookie.match(/ttwid=([^;]+)/);
    if (match && match[1]) {
      return match[1];
    }
  } catch {}
  return null;
}

// Bơm đầy Cookie Pool chạy ngầm trong nền
async function refillCookiePoolBackground() {
  if (isRefilling || Date.now() < refillCooldownUntil) return;
  isRefilling = true;

  try {
    const needed = TARGET_POOL_SIZE - cookiePool.length;
    for (let i = 0; i < Math.max(1, needed); i++) {
      if (Date.now() < refillCooldownUntil) break;
      const freshVal = await fetchFreshTtwidFromByteDance();
      if (freshVal) {
        const exists = cookiePool.some((c) => c.value === freshVal);
        if (!exists) {
          cookiePool.push({
            value: freshVal,
            createdAt: Date.now(),
            failsCount: 0,
          });
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } finally {
    isRefilling = false;
  }
}

// Định kỳ mỗi 30 phút dọn cookie hết hạn và làm mới Pool
setInterval(() => {
  const now = Date.now();
  for (let i = cookiePool.length - 1; i >= 0; i--) {
    const c = cookiePool[i];
    if (now - c.createdAt > COOKIE_TTL_MS || c.failsCount >= 3) {
      cookiePool.splice(i, 1);
    }
  }

  if (cookiePool.length < TARGET_POOL_SIZE) {
    refillCookiePoolBackground();
  }
}, 30 * 60 * 1000);

setTimeout(() => {
  refillCookiePoolBackground();
}, 2000);

export async function getTtwid(): Promise<string> {
  const now = Date.now();

  const validCookies = cookiePool.filter(
    (c) => now - c.createdAt < COOKIE_TTL_MS && c.failsCount < 3
  );

  if (validCookies.length > 0) {
    roundRobinIndex = (roundRobinIndex + 1) % validCookies.length;
    const selected = validCookies[roundRobinIndex];

    if (cookiePool.length < TARGET_POOL_SIZE && !isRefilling && Date.now() >= refillCooldownUntil) {
      refillCookiePoolBackground();
    }

    return selected.value;
  }

  if (Date.now() >= refillCooldownUntil) {
    const instantFresh = await fetchFreshTtwidFromByteDance();
    if (instantFresh) {
      cookiePool.push({
        value: instantFresh,
        createdAt: Date.now(),
        failsCount: 0,
      });
      refillCookiePoolBackground();
      return instantFresh;
    }
  }

  return SEED_COOKIES[Math.floor(Math.random() * SEED_COOKIES.length)];
}

export function reportInvalidTtwid(badCookieValue?: string) {
  if (!badCookieValue) return;
  const item = cookiePool.find((c) => c.value === badCookieValue);
  if (item) {
    item.failsCount += 1;
    if (item.failsCount >= 3) {
      const idx = cookiePool.indexOf(item);
      if (idx !== -1) {
        cookiePool.splice(idx, 1);
      }
      if (Date.now() >= refillCooldownUntil) {
        refillCookiePoolBackground();
      }
    }
  }
}
