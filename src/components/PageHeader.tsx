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
    <div className="flex items-start justify-between max-md:flex-col max-md:gap-3">
      <div className="max-md:hidden">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      <div className="max-md:w-full overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {action}
      </div>
    </div>
  );
}
