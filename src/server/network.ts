import { SocksProxyAgent } from 'socks-proxy-agent';
import { WARP_SOCKS_URL } from './constants';

export let warpAgent: SocksProxyAgent | null = null;
try {
  warpAgent = new SocksProxyAgent(WARP_SOCKS_URL);
} catch {
  warpAgent = null;
}

/**
 * Phân tích header Retry-After theo tiêu chuẩn HTTP (Số giây hoặc HTTP-Date GMT)
 * Lấy cảm hứng từ thuật toán parse_retry_after của Scrapling
 */
export function parseRetryAfter(headerValue: string | null | undefined): number {
  if (!headerValue) return 0;
  const trimmed = headerValue.trim();

  // Dạng 1: Số giây (e.g. "15", "120")
  const seconds = Number(trimmed);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  // Dạng 2: Chuẩn HTTP Date (e.g. "Wed, 21 Oct 2026 07:28:00 GMT")
  const parsedDate = Date.parse(trimmed);
  if (!isNaN(parsedDate)) {
    const diff = parsedDate - Date.now();
    return diff > 0 ? diff : 0;
  }

  return 0;
}

// Bảng Circuit Breaker theo dõi cooldown của từng host để không spam khi bị Rate Limit
const hostCooldownMap = new Map<string, number>();

export function isHostInCooldown(url: string): boolean {
  try {
    const host = new URL(url).host;
    const cooldownUntil = hostCooldownMap.get(host) || 0;
    if (Date.now() < cooldownUntil) {
      return true;
    }
    if (cooldownUntil > 0) {
      hostCooldownMap.delete(host);
    }
  } catch {}
  return false;
}

export function setHostCooldown(url: string, durationMs: number) {
  try {
    const host = new URL(url).host;
    // Giới hạn thời gian hạ nhiệt tối thiểu 5s, tối đa 30s để bảo vệ tài nguyên
    const safeDuration = Math.min(30000, Math.max(5000, durationMs));
    hostCooldownMap.set(host, Date.now() + safeDuration);
  } catch {}
}

export interface SmartFetchOptions {
  method?: string;
  headers?: Record<string, string> | any;
  body?: any;
  redirect?: 'follow' | 'manual' | 'error';
  signal?: any;
  timeout?: number;
  useProxy?: boolean;
}

export class SmartResponse {
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

export async function smartFetch(url: string, options: SmartFetchOptions = {}): Promise<SmartResponse> {
  const { useProxy = true, timeout = 10000, ...fetchOpts } = options;

  // Kiểm tra Circuit Breaker trước khi gửi request
  if (isHostInCooldown(url)) {
    throw new Error(`HOST_COOLDOWN_ACTIVE: ${url}`);
  }

  const handleResponseBackoff = (res: any) => {
    // Nếu gặp mã rate limit 429 hoặc 503, tự động kích hoạt cooldown cho host
    if (res.status === 429 || res.status === 503) {
      const retryAfterVal = res.headers?.get?.('retry-after') || res.headers?.['retry-after'];
      const backoffMs = parseRetryAfter(retryAfterVal) || 10000;
      setHostCooldown(url, backoffMs);
    }
  };

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
      handleResponseBackoff(res);
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
    handleResponseBackoff(res);
    return new SmartResponse(res, url);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function fetchWithConnectTimeout(
  url: string,
  options: any = {},
  connectTimeoutMs = 12000
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, connectTimeoutMs);

  const fetchOptions: any = {
    ...options,
    signal: controller.signal,
  };

  // CDN media của Douyin/TikTok không khóa IP, không cho đi qua WARP proxy để tránh bị bóp băng thông
  const isCdnUrl = /douyinvod\.com|zjcdn\.com|byteimg\.com|tiktokcdn\.com|snssdk\.com\/video|ixigua\.com|pstatp\.com/i.test(url);

  if (!isCdnUrl && warpAgent) {
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

export function isValidMediaResponse(res: globalThis.Response | null): boolean {
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
