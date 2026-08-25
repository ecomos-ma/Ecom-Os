/**
 * Prefetch route chunks on sidebar link hover.
 * Preloads the lazy-imported module so navigation feels instant.
 */

const prefetchedRoutes = new Set<string>();

const routeImportMap: Record<string, () => Promise<unknown>> = {
    '/dashboard': () => import('../pages/Dashboard'),
    '/orders': () => import('../pages/Orders'),
    '/confirmation': () => import('../pages/Confirmation'),
    '/delivering': () => import('../pages/Delivering'),
    '/shipping': () => import('../pages/Shipping'),
    '/customers': () => import('../pages/Customers'),
    '/products-inventory': () => import('../pages/ProductsAndInventory'),
    '/ads-manager': () => import('../pages/AdsManager'),
    '/tiktok-ads': () => import('../pages/TikTokAds'),
    '/expenses': () => import('../pages/Expenses'),
    '/finance': () => import('../pages/Finance'),
    '/cod-scenarios': () => import('../pages/CodScenarios'),
    '/team': () => import('../pages/Team'),
    '/settings': () => import('../pages/Settings'),
    '/tools': () => import('../pages/AmineTools'),
    '/amine': () => import('../pages/AmineTools'),
};

export function prefetchRoute(path: string): void {
    if (prefetchedRoutes.has(path)) return;
    const importer = routeImportMap[path];
    if (importer) {
        prefetchedRoutes.add(path);
        // Use requestIdleCallback if available, otherwise setTimeout
        const schedule = typeof requestIdleCallback === 'function'
            ? requestIdleCallback
            : (cb: () => void) => setTimeout(cb, 50);
        schedule(() => {
            importer().catch(() => {
                // If prefetch fails, allow retry
                prefetchedRoutes.delete(path);
            });
        });
    }
}

/**
 * Returns an onMouseEnter handler for a given route path.
 * Usage: <NavLink onMouseEnter={getPrefetchHandler('/orders')} ... />
 */
const handlerCache = new Map<string, () => void>();

export function getPrefetchHandler(path: string): () => void {
    let handler = handlerCache.get(path);
    if (!handler) {
        handler = () => prefetchRoute(path);
        handlerCache.set(path, handler);
    }
    return handler;
}
