import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getSafeReturnPath } from "../lib/appUrl";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const finishAuth = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const safeReturnTo = getSafeReturnPath(searchParams.get("returnTo"), "");
        const cleanPath = safeReturnTo
          ? `/auth/callback?returnTo=${encodeURIComponent(safeReturnTo)}`
          : "/auth/callback";
        window.history.replaceState(window.history.state, document.title, cleanPath);

        if (!data.session) throw new Error("Authentication session was not created.");
        navigate(safeReturnTo ? `/login?returnTo=${encodeURIComponent(safeReturnTo)}` : "/login", { replace: true });
      } catch {
        if (active) {
          window.history.replaceState(window.history.state, document.title, "/auth/callback");
          setError("We could not finish signing you in. Please return to the login page and try again.");
        }
      }
    };

    void finishAuth();
    return () => {
      active = false;
    };
  }, [navigate, searchParams]);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-base px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {error ? <p className="text-sm text-danger">{error}</p> : <Loader2 size={24} className="animate-spin text-brand-accent" />}
      </div>
    </main>
  );
}
