import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getSafeReturnPath } from "../lib/appUrl";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let active = true;

    const finishAuth = async () => {
      const logReason = (reason: string, details?: unknown) => {
        console.error(`[AuthCallback] ${reason}`, details instanceof Error ? details.message : details ?? "");
      };
      let unsubscribeSessionListener: () => void = () => undefined;

      try {
        const safeReturnTo = getSafeReturnPath(
          searchParams.get("returnTo") || window.sessionStorage.getItem("ecomos:oauth-return-to"),
          "",
        );
        const code = searchParams.get("code");
        const oauthError = searchParams.get("error");
        const oauthErrorDescription = searchParams.get("error_description");
        if (oauthError) {
          logReason("oauth_callback_error", oauthError);
          throw new Error(oauthError === "access_denied" ? "oauth_cancelled" : oauthErrorDescription || oauthError);
        }

        let settled = false;
        let timeout = 0;
        const sessionReady = new Promise<void>((resolve, reject) => {
          const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
            if (!settled && session && ["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED"].includes(event)) {
              settled = true;
              window.clearTimeout(timeout);
              unsubscribeSessionListener();
              resolve();
            }
          });
          unsubscribeSessionListener = () => subscription.subscription.unsubscribe();
          timeout = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            unsubscribeSessionListener();
            logReason("oauth_session_missing");
            reject(new Error("Authentication session was not created."));
          }, 10_000);
        });

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            logReason("oauth_code_exchange_failed", exchangeError);
            throw exchangeError;
          }
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          logReason("oauth_session_missing", sessionError);
          throw sessionError;
        }
        if (!data.session) {
          await sessionReady;
        } else if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          unsubscribeSessionListener();
        }

        window.sessionStorage.removeItem("ecomos:oauth-return-to");
        window.history.replaceState(window.history.state, document.title, "/auth/callback");

        window.location.replace(safeReturnTo || "/login");
      } catch (caught) {
        unsubscribeSessionListener();
        if (active) {
          window.history.replaceState(window.history.state, document.title, "/auth/callback");
          setError(caught instanceof Error && caught.message === "oauth_cancelled"
            ? "Google sign-in was cancelled."
            : "We could not finish signing you in. Please return to the login page and try again.");
        }
      }
    };

    void finishAuth();
    return () => {
      active = false;
    };
  }, [searchParams]);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-base px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {error ? <p className="text-sm text-danger">{error}</p> : <Loader2 size={24} className="animate-spin text-brand-accent" />}
      </div>
    </main>
  );
}
