import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

export default function WaitingForVerification() {
  const { session, loading, operationalAccess } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("submitted");
  const [note, setNote] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (!session?.user.id) return; let active = true; const load = async () => { const { data } = await supabase.from("subscription_payment_requests").select("status,admin_note").eq("owner_user_id", session.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(); if (!active || !data) return; setStatus(data.status); setNote(data.admin_note); setReady(true); if (data.status === "paid" || data.status === "waived" || operationalAccess) navigate("/dashboard", { replace: true }); if (data.status === "rejected") navigate("/payment", { replace: true }); }; void load(); const timer = window.setInterval(() => void load(), 8000); return () => { active = false; window.clearInterval(timer); }; }, [navigate, operationalAccess, session?.user.id]);
  if (loading || !ready) return <Screen><Loader2 className="animate-spin text-brand-accent" /></Screen>;
  if (!session) return <Navigate to="/login" replace />;
  return <Screen><main className="w-full max-w-xl px-4 py-16 text-center md:px-8">{status === "rejected" ? <XCircle className="mx-auto text-danger" size={48} /> : <Clock3 className="mx-auto text-brand-accent" size={48} />}<h1 className="mt-5 text-3xl font-bold">{status === "rejected" ? "Payment needs attention" : "Waiting for verification"}</h1><p className="mt-3 text-ink-muted">{status === "rejected" ? "Your payment proof was rejected. Review the note and submit a corrected receipt." : "We received your payment proof. Your account will remain locked until an admin approves the transfer."}</p>{note && <p className="mt-5 rounded-xl bg-base-raised p-4 text-left text-sm"><strong>Admin note:</strong> {note}</p>}<div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted"><CheckCircle2 size={17} className="text-emerald-600" />Payment status: {status}</div>{status === "rejected" && <button onClick={() => navigate("/payment")} className="mt-7 block w-full rounded-xl bg-brand-accent px-5 py-3 text-sm font-bold text-white">Review payment</button>}</main></Screen>;
}
function Screen({ children }: { children: ReactNode }) { return <div className="min-h-screen bg-base px-4 text-ink"><div className="mx-auto flex min-h-screen max-w-7xl items-start justify-center">{children}</div></div>; }
