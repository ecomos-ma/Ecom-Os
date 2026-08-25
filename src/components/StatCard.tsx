import { ReactNode, memo } from "react";

export const StatCard = memo(function StatCard({
  icon,
  iconColor = "text-brand-accent",
  iconBg = "bg-brand-accent/15",
  value,
  label,
  trend,
  tooltip,
}: {
  icon: ReactNode;
  iconColor?: string;
  iconBg?: string;
  value: string;
  label: string;
  trend?: ReactNode;
  tooltip?: string;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-base-border/50 bg-base-surface/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-base-border hover:shadow-md hover:bg-base-surface max-md:p-5 max-md:shadow-lg max-md:bg-base-surface/60"
      title={tooltip}
    >
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-brand-accent/20 to-transparent opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 max-md:opacity-100"></div>
      <div className="mb-3 flex items-center justify-between max-md:mb-4 relative z-10">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg} ${iconColor} max-md:h-11 max-md:w-11 max-md:rounded-xl`}>
          {icon}
        </div>
        {trend}
      </div>
      <div className="font-mono text-[20px] font-semibold text-ink max-md:text-[28px] max-md:tracking-tight relative z-10">{value}</div>
      <div className="mt-0.5 text-[12.5px] text-ink-muted max-md:text-[14px] max-md:mt-1 max-md:font-medium relative z-10">{label}</div>
    </div>
  );
});
