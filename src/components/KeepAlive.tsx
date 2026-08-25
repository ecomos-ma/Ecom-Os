import { useRef, useEffect, memo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface CachedPage {
    path: string;
    element: ReactNode;
    scrollY: number;
}

const MAX_PAGES = 8;

/**
 * KeepAlive — preserves previously rendered pages by hiding them
 * with `display:none` instead of unmounting.
 * Preserves scroll position, form state, filters, etc.
 */
function KeepAliveInner({ children }: { children: ReactNode }) {
    const location = useLocation();
    const pagesRef = useRef<CachedPage[]>([]);
    const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const prevPathRef = useRef<string>("");

    const currentPath = location.pathname;

    // Save scroll position for the page we're leaving
    useEffect(() => {
        return () => {
            const leaving = prevPathRef.current;
            if (leaving) {
                const page = pagesRef.current.find(p => p.path === leaving);
                if (page) {
                    page.scrollY = window.scrollY;
                }
            }
        };
    }, [currentPath]);

    // Update or add the current page
    const existingIndex = pagesRef.current.findIndex(p => p.path === currentPath);
    if (existingIndex >= 0) {
        // Move to end (most recently used)
        const [page] = pagesRef.current.splice(existingIndex, 1);
        page.element = children;
        pagesRef.current.push(page);
    } else {
        // Add new page
        if (pagesRef.current.length >= MAX_PAGES) {
            const removed = pagesRef.current.shift()!;
            containerRefs.current.delete(removed.path);
        }
        pagesRef.current.push({ path: currentPath, element: children, scrollY: 0 });
    }

    // Restore scroll position for the current page
    useEffect(() => {
        const page = pagesRef.current.find(p => p.path === currentPath);
        if (page && page.scrollY > 0) {
            requestAnimationFrame(() => {
                window.scrollTo(0, page.scrollY);
            });
        }
        prevPathRef.current = currentPath;
    }, [currentPath]);

    return (
        <>
            {pagesRef.current.map(page => (
                <div
                    key={page.path}
                    ref={el => {
                        if (el) containerRefs.current.set(page.path, el);
                    }}
                    style={{
                        display: page.path === currentPath ? "contents" : "none",
                    }}
                >
                    {page.element}
                </div>
            ))}
        </>
    );
}

export const KeepAlive = memo(KeepAliveInner);
