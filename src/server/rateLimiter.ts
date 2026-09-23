import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message: string;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const ipStore = new Map<string, RateLimitRecord>();

  // Tự động dọn dẹp các IP không còn hoạt động mỗi 2 phút để bảo vệ RAM
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipStore.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < options.windowMs);
      if (record.timestamps.length === 0) {
        ipStore.delete(ip);
      }
    }
  }, 2 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction) => {
    // Ưu tiên đọc IP thực từ Cloudflare (cf-connecting-ip) hoặc Reverse Proxy (x-forwarded-for)
    const clientIp =
      (req.headers['cf-connecting-ip'] as string) ||
      ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown_client';

    const now = Date.now();
    let record = ipStore.get(clientIp);

    if (!record) {
      record = { timestamps: [] };
      ipStore.set(clientIp, record);
    }

    // Lọc lại các timestamp còn nằm trong khung thời gian windowMs
    record.timestamps = record.timestamps.filter((ts) => now - ts < options.windowMs);

    if (record.timestamps.length >= options.maxRequests) {
      const retryAfterSec = Math.ceil(
        (record.timestamps[0] + options.windowMs - now) / 1000
      );
      res.setHeader('Retry-After', Math.max(1, retryAfterSec));
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: options.message,
        retryAfter: Math.max(1, retryAfterSec),
      });
    }

    record.timestamps.push(now);
    next();
  };
}

// 1. Giới hạn phân giải link: 20 lượt / phút
export const extractRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Bạn đang gửi yêu cầu quá nhanh. Vui lòng chờ 1 phút trước khi thử lại.',
});

// 2. Giới hạn tải file / stream media: 50 lượt / phút (đảm bảo album nhiều ảnh)
export const downloadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 50,
  message: 'Băng thông tải đang bận do có quá nhiều tệp. Vui lòng thử lại sau giây lát.',
});

// 3. Giới hạn chat Gemini AI: 10 lượt / phút (tránh cạn kiệt quota API)
export const geminiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'Số lượt hỏi Gemini AI vượt giới hạn. Vui lòng chờ 1 phút trước khi tiếp tục.',
});
