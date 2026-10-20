import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
  badge,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="app-page-header flex items-start justify-between gap-3 max-md:flex-col">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] max-md:text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="app-page-actions max-md:w-full min-w-0">{action}</div>}
    </div>
  );
}
