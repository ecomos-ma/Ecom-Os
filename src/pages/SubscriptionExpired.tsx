import { useNavigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";

export default function SubscriptionExpired() {
  const navigate = useNavigate();
  return <main className="grid min-h-screen place-items-center bg-base px-4 text-ink"><section className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-base-surface p-7 text-center shadow-xl"><LockKeyhole className="mx-auto text-amber-600" size={46} /><h1 className="mt-5 text-2xl font-bold">Your subscription has expired</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Your account is locked until you submit a new payment. Your data is safe. Pay to reactivate access.</p><button type="button" onClick={() => navigate("/choose-plan")} className="mt-6 rounded-xl bg-brand-accent px-5 py-3 text-sm font-bold text-white">Pay to reactivate</button></section></main>;
}
