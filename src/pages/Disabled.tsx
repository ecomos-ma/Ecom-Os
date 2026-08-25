import { ArrowLeft, Phone, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

function accountNotice() {
  try {
    const raw = window.sessionStorage.getItem("ecomos-account-notice");
    if (!raw) return { state: "suspended", message: "Your account is currently unavailable. Please contact support if you need help." };
    const data = JSON.parse(raw) as { state?: string; message?: string };
    return { state: data.state === "closed" ? "closed" : "suspended", message: data.message || "Your account is currently unavailable. Please contact support if you need help." };
  } catch { return { state: "suspended", message: "Your account is currently unavailable. Please contact support if you need help." }; }
}

export default function Disabled() {
  const notice = accountNotice();
  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4 py-10">
      <div className="w-full max-w-[540px] rounded-2xl border border-red-500/20 bg-base-surface p-8 shadow-card">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <ShieldAlert size={30} />
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Account {notice.state === "closed" ? "Closed" : "Suspended"}</h1>
          <p className="mt-2 text-[14px] text-ink-muted">
            {notice.message}
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-base-border bg-base-raised/70 p-4 text-[13px] text-ink-muted">
          If you believe this is a mistake, please contact support.
        </div>

        <div className="mt-6 rounded-xl border border-base-border bg-base-raised/50 p-4">
          <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
            <Phone size={16} className="text-brand" />
            Support
          </div>
          <a href="tel:0770877821" className="mt-2 block text-[14px] text-brand hover:underline">
            0770877821
          </a>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <a
            href="tel:0770877821"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-brand/90"
          >
            <Phone size={15} />
            Contact Support
          </a>
          <Link
            to="/login"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-base-border bg-base-raised px-4 py-2.5 text-[13px] font-medium text-ink transition hover:bg-base"
          >
            <ArrowLeft size={15} />
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
