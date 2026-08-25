import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-base to-base-raised p-4">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15">
            <ShieldAlert size={32} className="text-red-400" />
          </div>
        </div>

        <h1 className="text-[32px] font-bold text-ink mb-2">403</h1>
        <h2 className="text-[24px] font-semibold text-ink mb-3">Access Denied</h2>

        <p className="text-[13px] text-ink-muted mb-6">
          You don't have permission to access this page. Contact your workspace administrator to request access.
        </p>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 mb-6 text-[12px] text-amber-200">
          <p>Your current permissions don't include access to this resource. If you believe this is a mistake, please reach out to your team administrator.</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate("/")}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-dim transition"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
          <button
            onClick={() => navigate("/team")}
            className="flex items-center justify-center gap-2 rounded-lg border border-base-border bg-base-raised px-4 py-2 text-[13px] font-medium text-ink-muted hover:text-ink transition"
          >
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
}
