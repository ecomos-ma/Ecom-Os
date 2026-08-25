import { LucideIcon } from "lucide-react";

interface AdminStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
  color?: 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'brand';
  loading?: boolean;
}

export function AdminStatCard({ 
  title, 
  value, 
  subtitle, 
  change, 
  changeType = 'neutral',
  icon: Icon, 
  color = 'brand',
  loading = false 
}: AdminStatCardProps) {
  const colorClasses = {
    blue: "from-blue-500/20 to-blue-600/20 text-blue-400 bg-blue-500/10",
    purple: "from-purple-500/20 to-purple-600/20 text-purple-400 bg-purple-500/10",
    green: "from-emerald-500/20 to-emerald-600/20 text-emerald-400 bg-emerald-500/10",
    amber: "from-amber-500/20 to-amber-600/20 text-amber-400 bg-amber-500/10",
    red: "from-red-500/20 to-red-600/20 text-red-400 bg-red-500/10",
    brand: "from-brand-accent/20 to-purple-500/20 text-brand-accent bg-brand-accent/10",
  };

  const changeColorClasses = {
    positive: 'text-emerald-400',
    negative: 'text-red-400',
    neutral: 'text-slate-400',
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6">
        <div className="animate-pulse">
          <div className="h-4 w-24 bg-slate-800 rounded mb-4"></div>
          <div className="h-8 w-32 bg-slate-800 rounded mb-2"></div>
          <div className="h-3 w-20 bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${colorClasses[color]}`}>
          <Icon size={24} />
        </div>
        {change && (
          <span className={`text-sm font-medium ${changeColorClasses[changeType]}`}>
            {change}
          </span>
        )}
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-slate-400">{title}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}