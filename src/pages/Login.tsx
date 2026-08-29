import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { BillingPeriod, PlanTier, PRICING_PLANS } from "../config/pricing";
import heroImage from "../assets/login-operations-hero.webp";

const planOrder: PlanTier[] = ["starter", "growth", "pro", "scale"];

function isPlanTier(value: string | null): value is PlanTier {
  return value !== null && planOrder.includes(value as PlanTier);
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials") || normalized.includes("invalid credentials")) return "The email or password is incorrect.";
  if (normalized.includes("email not confirmed")) return "Confirm your email address before signing in.";
  if (normalized.includes("user already registered")) return "An account already exists for this email. Sign in instead.";
  if (normalized.includes("network") || normalized.includes("fetch")) return "We could not reach the server. Check your connection and try again.";
  return message || "Something went wrong. Please try again.";
}

export default function Login() {
  const { session, loading, profile, defaultRoute, subscriptionStatus, operationalAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPlan = searchParams.get("plan");
  const requestedBilling = searchParams.get("billing");
  const startsInSignup = searchParams.get("mode") === "signup" || isPlanTier(requestedPlan);

  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">(startsInSignup ? "sign-up" : "sign-in");
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(isPlanTier(requestedPlan) ? requestedPlan : "growth");
  const [billing, setBilling] = useState<BillingPeriod>(requestedBilling === "yearly" ? "yearly" : "monthly");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (searchParams.get("mode") === "signup" || isPlanTier(searchParams.get("plan"))) setAuthMode("sign-up");
    const planParam = searchParams.get("plan");
    if (isPlanTier(planParam)) setSelectedPlan(planParam);
    setBilling(searchParams.get("billing") === "yearly" ? "yearly" : "monthly");
  }, [searchParams]);

  const plan = PRICING_PLANS[selectedPlan];
  const planPrice = billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
  const isProcessing = busy || googleBusy || loading;

  if (!loading && session) {
    const returnTo = searchParams.get("returnTo");
    let route = profile?.role === "supervisor" ? "/dashboard" : defaultRoute ?? "/dashboard";

    const waitingStatuses = new Set([
      "under_review",
      "pending_payment",
      "submitted",
      "reviewing",
      "awaiting_review",
      "awaiting_verification",
    ]);

    if (subscriptionStatus === "expired") {
      route = "/subscription-expired";
    } else if (waitingStatuses.has(subscriptionStatus)) {
      route = "/waiting-verification";
    } else if (operationalAccess === false) {
      route = "/payment";
    } else if (returnTo?.startsWith("/") && returnTo !== "/login" && profile?.role !== "supervisor") {
      route = returnTo;
    }

    return <Navigate to={route} replace />;
  }

  const updateMode = (nextMode: "sign-in" | "sign-up") => {
    setAuthMode(nextMode);
    setError(null);
    setSignupSuccess(false);
    const next = new URLSearchParams(searchParams);
    if (nextMode === "sign-up") {
      next.set("mode", "signup");
      next.set("plan", selectedPlan);
      next.set("billing", billing);
    } else {
      next.delete("mode");
      next.delete("plan");
      next.delete("billing");
    }
    setSearchParams(next, { replace: true });
  };

  const rememberPlan = () => {
    window.localStorage.setItem("ecomos_pending_plan", JSON.stringify({ plan: selectedPlan, billing, selectedAt: new Date().toISOString() }));
  };

  const startGoogleOAuth = async () => {
    setGoogleBusy(true);
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/login` } });
    if (authError) {
      setGoogleBusy(false);
      setError(friendlyAuthError(authError.message));
    }
  };

  const completeSignup = async () => {
    rememberPlan();
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            full_name: fullName.trim(),
            workspace_name: workspaceName.trim(),
            selected_plan: selectedPlan,
            billing_period: billing,
          },
        },
      });
      if (authError) {
        setError(friendlyAuthError(authError.message));
      } else {
        setSignupSuccess(true);
      }
    } catch (caught) {
      setError(friendlyAuthError(caught instanceof Error ? caught.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (authMode === "sign-up" && !fullName.trim()) return setError("Enter your full name.");
    if (authMode === "sign-up" && !workspaceName.trim()) return setError("Enter your workspace name.");
    if (!email.trim() || !email.includes("@")) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    if (password.length < 6) return setError("Password must contain at least 6 characters.");
    if (authMode === "sign-up" && !acceptedTerms) return setError("Accept the Terms and Privacy Policy to create your account.");

    if (authMode === "sign-up") {
      void completeSignup();
      return;
    }

    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) setError(friendlyAuthError(authError.message));
    } catch (caught) {
      setError(friendlyAuthError(caught instanceof Error ? caught.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const onGoogleSignIn = async () => {
    setError(null);
    if (authMode === "sign-up" && !acceptedTerms) {
      setError("Accept the Terms and Privacy Policy to create your account.");
      return;
    }
    if (authMode === "sign-up") {
      await startGoogleOAuth();
      return;
    }
    await startGoogleOAuth();
  };

  if (signupSuccess) {
    return (
      <main className="grid min-h-screen place-items-center overflow-hidden bg-[#fffafb] px-5 py-12 text-slate-950">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(219,63,115,0.14),transparent_35%)]" />
        <section className="relative w-full max-w-lg rounded-[30px] border border-slate-200/80 bg-white p-7 text-center shadow-[0_28px_90px_rgba(61,20,35,0.12)] sm:p-10" aria-live="polite">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50"><CheckCircle2 className="h-8 w-8" /></div>
          <p className="mt-7 text-xs font-black uppercase tracking-[0.2em] text-[#c53265]">Workspace requested</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">Check your inbox</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">We sent a confirmation link to <strong className="text-slate-900">{email}</strong>. Confirm it to activate your workspace.</p>
          <div className="mt-7 flex items-center justify-between rounded-2xl border border-[#f2d6e0] bg-[#fff7fa] p-4 text-left">
            <div><p className="text-xs font-semibold text-slate-500">Selected plan</p><p className="mt-0.5 font-bold text-slate-950">{plan.name} · MAD {planPrice.toLocaleString("en-US")}</p></div>
            <BadgeCheck className="h-5 w-5 text-[#DB3F73]" />
          </div>
          <button type="button" onClick={() => updateMode("sign-in")} className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800">Continue to sign in <ArrowRight className="h-4 w-4" /></button>
        </section>
      </main>
    );
  }

  const inputClass = "h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-base font-medium text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-[#DB3F73] focus:ring-4 focus:ring-[#DB3F73]/10";

  return (
    <main className="min-h-screen bg-white font-sans text-slate-950 lg:grid lg:grid-cols-[minmax(560px,0.84fr)_minmax(620px,1.16fr)]">
      <section className="relative flex min-h-screen items-start justify-center overflow-y-auto px-5 py-8 sm:px-10 lg:max-h-screen lg:px-14 xl:px-20">
        <div className={`my-auto w-full max-w-[500px] transition duration-700 ${mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
          <Link to="/" className="mb-6 inline-flex items-center gap-2 rounded-full px-1 py-1 text-sm font-bold text-slate-500 transition hover:text-[#c53265]"><ArrowLeft className="h-4 w-4" /> Back to website</Link>

          <div className="rounded-[18px] bg-slate-100 p-1" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected={authMode === "sign-in"} onClick={() => updateMode("sign-in")} className={`h-12 w-1/2 rounded-[14px] text-base font-bold transition ${authMode === "sign-in" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Sign in</button>
            <button type="button" role="tab" aria-selected={authMode === "sign-up"} onClick={() => updateMode("sign-up")} className={`h-12 w-1/2 rounded-[14px] text-base font-bold transition ${authMode === "sign-up" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Create account</button>
          </div>

          <div className="mt-8">
            <h1 className="text-4xl font-bold leading-tight tracking-[-0.045em]">{authMode === "sign-in" ? "Welcome back" : "Create your account"}</h1>
            <p className="mt-2 text-base leading-7 text-slate-600">{authMode === "sign-in" ? "Enter your details to access your workspace." : "Enter your details first. You will choose your plan after email confirmation."}</p>
          </div>

          <button type="button" onClick={onGoogleSignIn} disabled={isProcessing} className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-base font-bold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            {googleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}{googleBusy ? "Connecting securely…" : "Continue with Google"}
          </button>

          <div className="my-5 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-slate-200" /><span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">or use email</span><span className="h-px flex-1 bg-slate-200" /></div>

          <form onSubmit={onSubmit} noValidate>
            <div className="space-y-4">
              {authMode === "sign-up" && <label className="block text-sm font-bold text-slate-700">Full name<span className="relative mt-2 block"><UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="Your full name" className={inputClass} /></span></label>}
              {authMode === "sign-up" && <label className="block text-sm font-bold text-slate-700">Workspace name<span className="relative mt-2 block"><Building2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} autoComplete="organization" placeholder="Your store or brand" className={inputClass} /></span></label>}
              <label className="block text-sm font-bold text-slate-700">Email address<span className="relative mt-2 block"><Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@company.com" className={inputClass} /></span></label>
              <label className="block text-sm font-bold text-slate-700">Password<span className="relative mt-2 block"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === "sign-in" ? "current-password" : "new-password"} placeholder="At least 6 characters" className={`${inputClass} pr-12`} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></span></label>
            </div>

            {authMode === "sign-up" && (
              <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-600">
                <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 h-5 w-5 rounded border-slate-300 accent-[#DB3F73]" />
                <span>I agree to the <Link to="/terms" className="font-bold text-[#c53265] hover:underline">Terms</Link> and <Link to="/privacy" className="font-bold text-[#c53265] hover:underline">Privacy Policy</Link>.</span>
              </label>
            )}

            {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold leading-5 text-rose-700" role="alert">{error}</div>}

            <button type="submit" disabled={isProcessing} className="mt-6 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#cf3167] to-[#f13f75] px-5 text-base font-bold text-white shadow-[0_12px_30px_rgba(219,63,115,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(219,63,115,0.3)] disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : authMode === "sign-in" ? <LockKeyhole className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}{busy ? "Please wait…" : authMode === "sign-in" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </section>

      <aside className="relative hidden min-h-screen items-center justify-center overflow-hidden border-l border-[#efdbe2] bg-[linear-gradient(145deg,#fff4f8_0%,#f9f4ff_50%,#f5fbff_100%)] p-5 lg:flex lg:max-h-screen">
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#ff7aa8]/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-violet-300/15 blur-3xl" />
        <img src={heroImage} alt="Moroccan ecommerce operator using the EcomOS order and delivery dashboard" className="relative z-10 h-full max-h-[94vh] w-full max-w-[1050px] object-contain drop-shadow-[0_32px_55px_rgba(94,38,61,0.16)]" />
      </aside>
    </main>
  );
}
