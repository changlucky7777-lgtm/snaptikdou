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

  // Tự động dọn dẹp bộ nhớ IP định kỳ mỗi 2 phút
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
    // BẢO MẬT: Sử dụng req.ip đã được Express xác thực an toàn thông qua app.set('trust proxy', 1)
    // Ngăn chặn hoàn toàn lỗ hổng IP Spoofing do client tự chèn header giả mạo
    const clientIp =
      req.ip ||
      req.socket.remoteAddress ||
      'unknown_client';

    const now = Date.now();
    let record = ipStore.get(clientIp);
    if (!record) {
      record = { timestamps: [] };
      ipStore.set(clientIp, record);
    }

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

// 2. Giới hạn tải file / stream media: 50 lượt / phút
export const downloadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 50,
  message: 'Băng thông tải đang bận do có quá nhiều tệp. Vui lòng thử lại sau giây lát.',
});
