import { ArrowLeft, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSupportMode } from "../contexts/SupportModeContext";

export function AdminPreviewBanner() {
  const navigate = useNavigate();
  const { context, end } = useSupportMode();

  if (!context) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-[85] -translate-x-1/2 px-3 sm:left-auto sm:right-5 sm:translate-x-0">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-950/95 p-2 text-white shadow-[0_18px_55px_rgba(15,23,42,0.32)] backdrop-blur-xl">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-emerald-300">
          <Eye size={17} />
        </div>
        <div className="hidden min-w-0 px-1 sm:block">
          <p className="max-w-52 truncate text-xs font-bold">{context.workspace.name}</p>
          <p className="text-[10px] text-slate-400">Admin view</p>
        </div>
        <button
          onClick={async () => {
            await end();
            navigate("/admin/workspaces");
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-slate-950 transition hover:bg-slate-100"
        >
          <ArrowLeft size={14} />
          Back to admin
        </button>
      </div>
    </div>
  );
}
