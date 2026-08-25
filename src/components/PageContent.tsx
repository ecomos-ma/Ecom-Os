import type { ReactNode } from "react";

type PageContentProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Shared workspace-page spacing. This is deliberately not a card: pages render
 * directly on the AppShell surface and keep their own semantic tables, forms,
 * and metric cards.
 */
export function PageContent({ children, className = "" }: PageContentProps) {
  return (
    <div className={`w-full min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-5 lg:py-5 ${className}`.trim()}>
      {children}
    </div>
  );
}
