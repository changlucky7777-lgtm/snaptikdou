import { SocksProxyAgent } from 'socks-proxy-agent';
import { WARP_SOCKS_URL } from './constants';

export let warpAgent: SocksProxyAgent | null = null;
try {
  warpAgent = new SocksProxyAgent(WARP_SOCKS_URL);
} catch {
  warpAgent = null;
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

export async function fetchWithConnectTimeout(
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
