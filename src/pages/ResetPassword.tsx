import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const startedRef = useRef(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // "exchanging" = waiting for the code exchange to complete
  // "ready"      = session established, show the form
  // "invalid"    = code missing / expired
  const [stage, setStage] = useState<"exchanging" | "ready" | "invalid">("exchanging");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // Prevent double-execution in React StrictMode
    if (startedRef.current) return;
    startedRef.current = true;

    const bootstrap = async () => {
      // With flowType: "pkce" + detectSessionInUrl: false  Supabase sends the
      // recovery token as a  ?code=  query param (PKCE code verifier flow).
      // We must exchange that code for a live session manually.
      const code = searchParams.get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          console.error("[ResetPassword] code exchange failed:", exchangeError.message);
          setStage("invalid");
          return;
        }
        // Clean the code from the URL so it can't be replayed
        window.history.replaceState(null, "", "/reset-password");
        setStage("ready");
        return;
      }

      // Fallback: maybe the user already has a PASSWORD_RECOVERY session
      // (e.g. older implicit flow or re-visit after exchange).
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        setStage("ready");
        return;
      }

      // Also listen for PASSWORD_RECOVERY in case Supabase emits it on its own
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          setStage("ready");
          subscription.unsubscribe();
        }
      });

      // If nothing happens in 5 s, the link is bad
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        setStage("invalid");
      }, 5000);

      return () => {
        clearTimeout(timeout);
        subscription.unsubscribe();
      };
    };

    void bootstrap();
  }, [searchParams]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!password || password.length < 8) {
      return setError("Le mot de passe doit contenir au moins 8 caractères.");
    }
    if (password !== confirm) {
      return setError("Les mots de passe ne correspondent pas.");
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || "Impossible de mettre à jour le mot de passe.");
      } else {
        setSuccess(true);
        await supabase.auth.signOut();
        setTimeout(() => navigate("/login?reset=success"), 2500);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-12 text-base font-medium text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-[#DB3F73] focus:ring-4 focus:ring-[#DB3F73]/10";

  return (
    <main className="grid min-h-screen place-items-center overflow-hidden bg-[#fffafb] px-5 py-12 text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(219,63,115,0.14),transparent_35%)]" />

      <div
        className={`relative w-full max-w-[440px] transition duration-700 ${mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        <Link
          to="/login"
          className="mb-6 inline-flex items-center gap-2 rounded-full px-1 py-1 text-sm font-bold text-slate-500 transition hover:text-[#c53265]"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à la connexion
        </Link>

        <section className="rounded-[30px] border border-slate-200/80 bg-white p-7 shadow-[0_28px_90px_rgba(61,20,35,0.12)] sm:p-10">

          {/* ── Success ──────────────────────────────────────────────────── */}
          {success && (
            <div className="text-center" aria-live="polite">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <p className="mt-7 text-xs font-black uppercase tracking-[0.2em] text-[#c53265]">
                Mot de passe mis à jour
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">Tout est prêt !</h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
                Votre mot de passe a été mis à jour. Vous allez être redirigé vers la page de connexion…
              </p>
              <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-[#DB3F73]" />
            </div>
          )}

          {/* ── Exchanging code / loading ─────────────────────────────────── */}
          {!success && stage === "exchanging" && (
            <div className="text-center" aria-live="polite">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#DB3F73]" />
              <p className="mt-4 text-sm font-medium text-slate-500">
                Vérification du lien de réinitialisation…
              </p>
            </div>
          )}

          {/* ── Invalid / expired link ────────────────────────────────────── */}
          {!success && stage === "invalid" && (
            <div className="text-center" aria-live="polite">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-8 ring-rose-50/50">
                <LockKeyhole className="h-8 w-8" />
              </div>
              <h1 className="mt-6 text-2xl font-bold tracking-[-0.03em]">Lien invalide ou expiré</h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
                Ce lien de réinitialisation n'est plus valide. Les liens expirent après 1 heure.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#cf3167] to-[#f13f75] text-sm font-bold text-white shadow-[0_12px_30px_rgba(219,63,115,0.24)] transition hover:-translate-y-0.5"
              >
                Demander un nouveau lien
              </Link>
            </div>
          )}

          {/* ── Reset password form ───────────────────────────────────────── */}
          {!success && stage === "ready" && (
            <>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c53265]">EcomOS</p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">Nouveau mot de passe</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Choisissez un mot de passe sécurisé d'au moins 8 caractères.
              </p>

              <form onSubmit={onSubmit} noValidate className="mt-7 space-y-4">
                <label className="block text-sm font-bold text-slate-700">
                  Nouveau mot de passe
                  <span className="relative mt-2 block">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Min. 8 caractères"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showPassword ? "Masquer" : "Afficher"}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </span>
                </label>

                <label className="block text-sm font-bold text-slate-700">
                  Confirmer le mot de passe
                  <span className="relative mt-2 block">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Répétez le mot de passe"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showConfirm ? "Masquer" : "Afficher"}
                    >
                      {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </span>
                </label>

                {error && (
                  <div
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold leading-5 text-rose-700"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#cf3167] to-[#f13f75] px-5 text-base font-bold text-white shadow-[0_12px_30px_rgba(219,63,115,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(219,63,115,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LockKeyhole className="h-5 w-5" />}
                  {busy ? "Mise à jour…" : "Enregistrer le mot de passe"}
                </button>
              </form>
            </>
          )}

        </section>
      </div>
    </main>
  );
}
