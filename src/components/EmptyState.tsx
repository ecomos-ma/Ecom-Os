import { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  subtitle,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  description?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 text-center ${compact ? "py-6" : "py-16"}`}>
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-base-raised text-brand">
          {icon}
        </div>
      )}
      <div className="text-[14px] font-medium text-ink">{title}</div>
      {(description || subtitle) && <div className="mt-1 max-w-md text-[12.5px] text-ink-muted">{description || subtitle}</div>}
      {(primaryAction || secondaryAction) && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{primaryAction}{secondaryAction}</div>}
    </div>
  );
}
