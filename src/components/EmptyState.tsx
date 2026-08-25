import { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-base-raised text-brand">
          {icon}
        </div>
      )}
      <div className="text-[14px] font-medium text-ink">{title}</div>
      {subtitle && <div className="mt-1 text-[12.5px] text-ink-muted">{subtitle}</div>}
    </div>
  );
}
