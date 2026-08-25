/**
 * Global in-memory cache with TTL for Supabase query results.
 * Prevents duplicate fetches and provides instant data on tab switch.
 */

interface CacheEntry<T = unknown> {
    data: T;
    timestamp: number;
    ttl: number;
}

const store = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

/** Default TTL: 60 seconds */
const DEFAULT_TTL = 60_000;

export function getCached<T>(key: string, allowStale = false): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (!allowStale && Date.now() - entry.timestamp > entry.ttl) {
        store.delete(key);
        return null;
    }
    return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
    store.set(key, { data, timestamp: Date.now(), ttl });
}

export function invalidate(key: string): void {
    store.delete(key);
}

export function invalidatePrefix(prefix: string): void {
    for (const k of store.keys()) {
        if (k.startsWith(prefix)) store.delete(k);
    }
}

export function clearAll(): void {
    store.clear();
    inFlight.clear();
}

/**
 * Runs one request for a stable cache key, even if React StrictMode or two
 * consumers ask for it at the same time. This deliberately caches only
 * successful responses; failures are never retained or retried here.
 */
export async function fetchCached<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = DEFAULT_TTL,
    force = false,
): Promise<T> {
    const cached = !force ? getCached<T>(key) : null;
    if (cached !== null) return cached;

    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const request = fetcher()
        .then((data) => {
            setCached(key, data, ttl);
            return data;
        })
        .finally(() => {
            if (inFlight.get(key) === request) inFlight.delete(key);
        });

    inFlight.set(key, request);
    return request;
}

export function getCacheAge(key: string): number | null {
    const entry = store.get(key);
    return entry ? Date.now() - entry.timestamp : null;
}
