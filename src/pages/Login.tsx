import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Mail, Lock, Play, Sun, Moon, Crown, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { createDemoSession, type DemoRole } from "../demo";

// NOTE: adjust this relative path if Login.tsx does not live in `src/pages/`.
// It must resolve to the project asset at `src/assets/1.png`.
import heroImage from "../assets/ChatGPT Image Aug 9, 2026, 09_03_26 PM.webp";

/* -------------------------------------------------------------------------
 * Small presentational helpers (kept local so this file is a drop-in
 * replacement — no new files/routes to wire up).
 * ---------------------------------------------------------------------- */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

function EyebrowLogo({ mode }: { mode: "light" | "dark" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xl font-bold tracking-tight">
        <span className={mode === "dark" ? "text-white" : "text-slate-900"}>Ecom</span>
        <span className="bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 bg-clip-text text-transparent">
          OS
        </span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Login page
 * ---------------------------------------------------------------------- */

export default function Login() {
  const { session, loading, profile, defaultRoute } = useAuth();
  const { mode, setLight, setDark } = useTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [activeModal, setActiveModal] = useState<"terms" | "privacy" | null>(null);
  const [mounted, setMounted] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const isProcessing = busy || loading;

  useEffect(() => {
    // Triggers the entrance animation a tick after mount, and is skipped
    // visually for users who prefer reduced motion via the CSS below.
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!loading && session) {
    const searchParams = new window.URLSearchParams(window.location.search);
    const returnTo = searchParams.get("returnTo");

    // Safely parse returnTo: ensuring it's a valid relative path starting with /
    let route = profile?.role === "supervisor" ? "/dashboard" : defaultRoute ?? "/dashboard";
    if (returnTo && returnTo.startsWith("/") && returnTo !== "/login" && profile?.role !== "supervisor") {
      route = returnTo;
    }

    return <Navigate to={route} replace />;
  }

  const friendlyAuthError = (message: string) => {
    const normalized = message.toLowerCase();
    if (normalized.includes("invalid login credentials") || normalized.includes("invalid credentials")) {
      return "Invalid email or password.";
    }
    if (normalized.includes("email not confirmed")) {
      return "Please confirm your email address before signing in.";
    }
    if (normalized.includes("network") || normalized.includes("fetch")) {
      return "Something went wrong. Please try again.";
    }
    return message || "Something went wrong. Please try again.";
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!acceptedTerms) {
      return setError("You must accept the Terms of Service and Privacy Policy.");
    }

    if (authMode === "sign-up") {
      if (!fullName.trim()) return setError("Full name is required.");
      if (!workspaceName.trim()) return setError("Workspace name is required.");
    }

    if (!email.trim()) return setError("Please enter your email address.");
    if (!email.includes("@")) return setError("Please enter a valid email address.");
    if (!password) return setError("Please enter your password.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    setBusy(true);

    try {
      if (authMode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setBusy(false);
        if (error) setError(friendlyAuthError(error.message));
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim() || email.split("@")[0],
              workspace_name: workspaceName.trim() || `${fullName.trim() || email.split("@")[0]}'s Workspace`,
            },
          },
        });
        setBusy(false);
        if (error) {
          setError(friendlyAuthError(error.message));
        } else {
          setSignupSuccess(true);
        }
      }
    } catch (err: any) {
      setBusy(false);
      setError(friendlyAuthError(err?.message || ""));
    }
  };

  const onGoogleSignIn = async () => {
    setError(null);
    setGoogleBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin, // Dynamic fallback to current client domain (localhost or production)
      },
    });
    if (error) {
      setGoogleBusy(false);
      setError(friendlyAuthError(error.message));
    }
    // On success the browser navigates away to Google, so we intentionally
    // leave googleBusy = true (button stays disabled/spinning) until then.
  };

  const toggleTheme = () => {
    if (mode === "dark") setLight();
    else setDark();
  };

  const onEnterDemo = async (role: DemoRole) => {
    setDemoBusy(true);
    try {
      createDemoSession(role);
      // Navigate to dashboard after creating demo session
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Failed to enter demo mode:", error);
    } finally {
      setDemoBusy(false);
    }
  };

  const isDark = mode === "dark";

  const title = authMode === "sign-in" ? "Sign in to your workspace" : "Create your workspace";
  const subtitle =
    authMode === "sign-in"
      ? "Access your ecommerce operations, orders, analytics and tools from one place."
      : "Set up your workspace and start managing orders, shipping and ads in minutes.";

  const motionBase = "transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none";

  /* ----------------------------- Success screen ---------------------------- */

  if (signupSuccess) {
    return (
      <div className={isDark ? "min-h-screen bg-slate-950 text-white" : "min-h-screen bg-white text-slate-900"}>
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: isDark
                ? "radial-gradient(circle at 15% 10%, rgba(236,72,153,0.10), transparent 40%), radial-gradient(circle at 85% 90%, rgba(56,189,248,0.10), transparent 40%)"
                : "radial-gradient(circle at 15% 10%, rgba(236,72,153,0.08), transparent 40%), radial-gradient(circle at 85% 90%, rgba(59,130,246,0.06), transparent 40%)",
            }}
          />
          <div
            className={`relative w-full max-w-md rounded-2xl border p-8 sm:p-10 shadow-xl ${motionBase} ${mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              } ${isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"}`}
          >
            <div className="mb-8 flex items-center justify-between">
              <EyebrowLogo mode={isDark ? "dark" : "light"} />
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${isDark
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>

            <div className={`rounded-xl border p-6 ${isDark ? "border-pink-400/10 bg-pink-500/5" : "border-pink-100 bg-pink-50/60"}`}>
              <div className="mb-3 text-3xl">📬</div>
              <h2 className="mb-2 text-xl font-semibold">Check your email</h2>
              <p className={`text-sm leading-6 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                We sent a confirmation link to <span className="font-medium">{email}</span>. Click it to activate
                your workspace, then return here to sign in.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSignupSuccess(false);
                  setAuthMode("sign-in");
                }}
                className={`mt-6 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${isDark ? "bg-white text-slate-950 hover:bg-slate-100" : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
              >
                Back to sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------------- Main view -------------------------------- */

  return (
    <div className={isDark ? "min-h-screen bg-slate-950" : "min-h-screen bg-white"}>
      <div className="grid min-h-screen lg:grid-cols-[minmax(400px,0.85fr)_minmax(500px,1.15fr)]">
        {/* ------------------------------ LEFT: LOGIN ------------------------------ */}
        <div className={`relative flex flex-col ${isDark ? "bg-slate-950" : "bg-white"}`}>
          <div className="flex items-center justify-between px-6 pt-6 sm:px-10 sm:pt-8">
            <EyebrowLogo mode={isDark ? "dark" : "light"} />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${isDark
                ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
            <div
              className={`w-full max-w-[420px] ${motionBase} ${mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-pink-600 dark:text-pink-400">
                Ecommerce Operating System
              </p>
              <h1 className={`mt-3 text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                {title}
              </h1>
              <p className={`mt-3 text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{subtitle}</p>

              {/* Google */}
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={googleBusy}
                className={`mt-8 flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${isDark
                  ? "border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
              >
                {googleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
                {googleBusy ? "Redirecting to Google…" : "Continue with Google"}
              </button>

              {/* Divider */}
              <div className={`my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.22em] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                <span className={`h-px flex-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                Or continue with email
                <span className={`h-px flex-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
              </div>

              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                {authMode === "sign-up" && (
                  <div className="grid gap-4">
                    <div>
                      <label
                        htmlFor="fullName"
                        className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}
                      >
                        Full name
                      </label>
                      <input
                        id="fullName"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Your full name"
                        className={inputClass(isDark)}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="workspaceName"
                        className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}
                      >
                        Workspace name
                      </label>
                      <input
                        id="workspaceName"
                        type="text"
                        value={workspaceName}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        placeholder="My Store Workspace"
                        className={inputClass(isDark)}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                    Email address
                  </label>
                  <div className="relative">
                    <span className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                      <Mail size={17} />
                    </span>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@store.ma"
                      className={`${inputClass(isDark)} pl-11`}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                    Password
                  </label>
                  <div className="relative">
                    <span className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                      <Lock size={17} />
                    </span>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={authMode === "sign-in" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className={`${inputClass(isDark)} pl-11 pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition ${isDark ? "text-slate-500 hover:text-pink-400" : "text-slate-400 hover:text-pink-500"
                        }`}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-3 pt-1">
                  <input
                    id="privacy-policy"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-pink-500 focus:ring-2 focus:ring-pink-500/30"
                  />
                  <label htmlFor="privacy-policy" className={`text-sm leading-snug ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                    I accept the{" "}
                    <button
                      type="button"
                      onClick={() => setActiveModal("terms")}
                      className="font-medium text-pink-600 underline-offset-2 hover:underline dark:text-pink-400"
                    >
                      Terms of Service
                    </button>{" "}
                    and{" "}
                    <button
                      type="button"
                      onClick={() => setActiveModal("privacy")}
                      className="font-medium text-pink-600 underline-offset-2 hover:underline dark:text-pink-400"
                    >
                      Privacy Policy
                    </button>
                    .
                  </label>
                </div>

                {error && (
                  <div
                    role="alert"
                    className={`rounded-xl px-4 py-3 text-sm ${isDark ? "bg-rose-950/60 text-rose-200" : "bg-rose-50 text-rose-700"
                      }`}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-pink-500/25 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isProcessing
                    ? authMode === "sign-in"
                      ? "Signing in…"
                      : "Creating workspace…"
                    : authMode === "sign-in"
                      ? "Sign in"
                      : "Create workspace"}
                </button>

                {authMode === "sign-in" && (
                  <>
                    <div className={`my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.22em] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                      <span className={`h-px flex-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                      Try the Demo
                      <span className={`h-px flex-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                    </div>
                    <div className="grid gap-3">
                      <button
                        type="button"
                        onClick={() => onEnterDemo("owner")}
                        disabled={demoBusy}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-3.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 ${isDark
                          ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        {demoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown size={15} />}
                        {demoBusy ? "Loading demo…" : "Demo as Owner"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onEnterDemo("agent")}
                        disabled={demoBusy}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-3.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 ${isDark
                          ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        {demoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users size={15} />}
                        {demoBusy ? "Loading demo…" : "Demo as Agent"}
                      </button>
                    </div>
                  </>
                )}
              </form>

              <div className="mt-6 text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
                    setError(null);
                  }}
                  className="font-semibold text-pink-600 transition hover:text-pink-500 dark:text-pink-400"
                >
                  {authMode === "sign-in" ? "New here? Create a free workspace" : "Already have an account? Sign in"}
                </button>
              </div>
            </div>
          </div>

          <div className={`px-6 pb-6 text-center text-xs sm:px-10 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
            © {new Date().getFullYear()} EcomOS. All rights reserved.
          </div>
        </div>

        {/* ------------------------------ RIGHT: HERO ------------------------------ */}
        <div
          className="relative hidden overflow-hidden lg:flex lg:h-full lg:items-center lg:justify-center"
          style={{
            background: isDark
              ? "linear-gradient(135deg, #0b1120 0%, #150b1d 55%, #0b1120 100%)"
              : "linear-gradient(135deg, #fdf2f8 0%, #faf5ff 45%, #eff6ff 100%)",
          }}
        >
          <div className="pointer-events-none absolute -top-24 -left-16 h-[420px] w-[420px] rounded-full bg-pink-400/20 blur-[110px]" />
          <div className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] h-[420px] w-[420px] rounded-full bg-purple-400/15 blur-[110px]" />
          <div className="pointer-events-none absolute top-1/3 right-0 h-72 w-72 rounded-full bg-blue-400/10 blur-[100px]" />

          <div
            className={`relative z-10 flex h-full w-full items-center justify-center px-6 py-8 lg:px-8 ${motionBase} ${mounted ? "scale-100 opacity-100" : "scale-[0.97] opacity-0"
              }`}
          >
            <img
              src={heroImage}
              alt=" dashboard overview with revenue, orders and delivery analytics"
              className="w-full max-h-[86vh] max-w-[980px] object-contain drop-shadow-[0_20px_45px_rgba(236,72,153,0.18)]"
            />
          </div>
        </div>

        {/* ------------------------------ MOBILE HERO ------------------------------ */}
        <div
          className="relative flex items-center justify-center overflow-hidden px-4 py-8 lg:hidden"
          style={{
            background: isDark
              ? "linear-gradient(135deg, #0b1120 0%, #150b1d 100%)"
              : "linear-gradient(135deg, #fdf2f8 0%, #eff6ff 100%)",
          }}
        >
          <div className="pointer-events-none absolute -top-10 -left-10 h-56 w-56 rounded-full bg-pink-400/15 blur-[80px]" />
          <div className="pointer-events-none absolute bottom-[-4rem] right-[-2rem] h-56 w-56 rounded-full bg-purple-400/10 blur-[80px]" />
          <img
            src={heroImage}
            alt="EcomOS dashboard overview with revenue, orders and delivery analytics"
            className="relative z-10 w-full max-w-[520px] object-contain"
          />
        </div>
      </div>

      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-6">
              <h3 className="text-xl font-bold capitalize text-white">
                {activeModal === "terms" ? "Terms and Conditions" : "Privacy Policy"}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="Close"
                className="text-slate-400 transition-colors hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 space-y-4 overflow-y-auto p-6 text-sm leading-relaxed text-slate-300">
              {activeModal === "terms" ? (
                <>
                  <h4 className="font-semibold text-white">1. Using the Service</h4>
                  <p>
                    You may use EcomOS for your business operations, analytics, and order management. You are
                    responsible for maintaining the confidentiality of your account credentials and for all activity
                    under your account.
                  </p>
                  <h4 className="font-semibold text-white">2. Acceptable Use</h4>
                  <p>
                    Do not use the platform to engage in unlawful activity, distribute malware, or attempt to
                    compromise the security of our systems. We reserve the right to suspend accounts that violate
                    these terms.
                  </p>
                  <h4 className="font-semibold text-white">3. Updates and Changes</h4>
                  <p>
                    We may update these terms from time to time. Continued use of EcomOS after changes are posted
                    constitutes acceptance of the revised terms.
                  </p>
                  <h4 className="font-semibold text-white">4. Limitation of Liability</h4>
                  <p>
                    EcomOS is provided as-is. We are not liable for indirect, incidental, or consequential damages
                    arising from your use of the service.
                  </p>
                </>
              ) : (
                <>
                  <h4 className="font-semibold text-white">1. Data Collection</h4>
                  <p>
                    We collect information you provide directly, such as account details and authentication
                    credentials, as well as usage data generated while using the platform.
                  </p>
                  <h4 className="font-semibold text-white">2. How We Use Data</h4>
                  <p>
                    Data is used to operate the service, improve features, and provide support. We do not sell
                    personal information to third parties.
                  </p>
                  <h4 className="font-semibold text-white">3. Security</h4>
                  <p>
                    We use industry-standard practices to protect your data. However, no system is completely
                    secure, and you also play a role in keeping your account safe.
                  </p>
                  <h4 className="font-semibold text-white">4. Your Choices</h4>
                  <p>
                    You can update your account information and opt out of marketing communications where
                    applicable. Contact support if you need help managing your data.
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-800 bg-slate-950 p-4">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-xl bg-slate-800 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Shared input styling — 12px radius, subtle border, pink focus ring.
 * ---------------------------------------------------------------------- */
function inputClass(isDark: boolean) {
  return [
    "w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200",
    isDark
      ? "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
      : "border-[#D9DDE7] bg-white text-slate-900 placeholder:text-slate-400 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20",
  ].join(" ");
}