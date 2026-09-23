interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCacheManager<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxItems: number;
  private defaultTtlMs: number;

  constructor(maxItems = 400, defaultTtlMs = 8 * 60 * 1000) {
    this.maxItems = maxItems;
    this.defaultTtlMs = defaultTtlMs;

    // Dọn dẹp các bản ghi hết hạn mỗi 3 phút
    setInterval(() => {
      this.purgeExpired();
    }, 3 * 60 * 1000);
  }

  get(key: string): T | null {
    if (!key) return null;
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Nếu đã hết hạn (TTL quá 8 phút), xóa ngay và trả về null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh vị trí trong Map (LRU behavior)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  set(key: string, data: T, ttlMs?: number): void {
    if (!key || !data) return;

    // Kiểm tra giới hạn số lượng mục để bảo vệ RAM
    if (this.cache.size >= this.maxItems) {
      // Xóa phần tử cũ nhất (phần tử đầu tiên của Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs || this.defaultTtlMs),
    });
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  size(): number {
    return this.cache.size;
  }
}

// Khởi tạo instance cache dùng chung cho toàn bộ luồng bóc tách (TTL 8 phút, max 400 video)
export const mediaExtractCache = new MemoryCacheManager(400, 8 * 60 * 1000);
