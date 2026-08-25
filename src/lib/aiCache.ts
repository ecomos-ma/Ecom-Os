/**
 * AI Result Caching System
 * Caches expensive AI operations to reduce API calls and improve performance
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface CacheConfig {
  productAnalysis: number;      // 30 minutes
  marketingAngles: number;      // 1 hour
  styleAnalysis: number;        // 2 hours
  landingPage: number;          // 24 hours
  sawtyScript: number;         // 24 hours
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  productAnalysis: 30 * 60 * 1000,      // 30 minutes
  marketingAngles: 60 * 60 * 1000,      // 1 hour
  styleAnalysis: 2 * 60 * 60 * 1000,    // 2 hours
  landingPage: 24 * 60 * 60 * 1000,     // 24 hours
  sawtyScript: 24 * 60 * 60 * 1000      // 24 hours
};

class AICache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private config: CacheConfig = DEFAULT_CACHE_CONFIG;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private generateKey(type: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${type}:${sortedParams}`;
  }

  set<T>(type: string, params: Record<string, any>, data: T, ttl?: number): void {
    const key = this.generateKey(type, params);
    const cacheTTL = ttl || this.getTTLForType(type);
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: cacheTTL
    });
  }

  get<T>(type: string, params: Record<string, any>): T | null {
    const key = this.generateKey(type, params);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  has(type: string, params: Record<string, any>): boolean {
    const key = this.generateKey(type, params);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  invalidate(type: string, params?: Record<string, any>): void {
    if (params) {
      const key = this.generateKey(type, params);
      this.cache.delete(key);
    } else {
      // Invalidate all entries of this type
      const prefix = `${type}:`;
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    }
  }

  invalidateProductAnalysis(productUrl: string): void {
    this.invalidate('productAnalysis', { productUrl });
    this.invalidate('marketingAngles', { productUrl });
  }

  invalidateStyleAnalysis(styleId: string): void {
    this.invalidate('styleAnalysis', { styleId });
  }

  invalidateLandingPage(landingPageId: string): void {
    this.invalidate('landingPage', { landingPageId });
  }

  invalidateSawtyScript(generationId: string): void {
    this.invalidate('sawtyScript', { generationId });
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  private getTTLForType(type: string): number {
    switch (type) {
      case 'productAnalysis':
        return this.config.productAnalysis;
      case 'marketingAngles':
        return this.config.marketingAngles;
      case 'styleAnalysis':
        return this.config.styleAnalysis;
      case 'landingPage':
        return this.config.landingPage;
      case 'sawtyScript':
        return this.config.sawtyScript;
      default:
        return 60 * 60 * 1000; // Default 1 hour
    }
  }

  setConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Singleton instance
const aiCache = new AICache();

export async function getCachedOrFetch<T>(
  type: string,
  params: Record<string, any>,
  fetchFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Try to get from cache
  const cached = aiCache.get<T>(type, params);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const data = await fetchFn();
  
  // Cache the result
  aiCache.set(type, params, data, ttl);
  
  return data;
}

export {
  aiCache,
  AICache,
  DEFAULT_CACHE_CONFIG
};

export type { CacheConfig };
