import { ReactNode } from "react";

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: string[];
}

export function AdminPageHeader({ title, description, actions, breadcrumb }: AdminPageHeaderProps) {
  return (
    <div className="mb-8">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-3">
          {breadcrumb.map((item, index) => (
            <span key={index} className="flex items-center gap-2">
              {item}
              {index < breadcrumb.length - 1 && <span>/</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
          {description && <p className="text-slate-400">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}