import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";

// Fixed: removed deprecated supabase.auth.session() call
export default function OAuthCallback({ provider }: { provider: "google" | "youcan" }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Finishing connection…");

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");

    if (oauthError) {
      setStatus("error");
      setMessage(`${provider === "youcan" ? "YouCan" : "Google"} declined the request.`);
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("Missing authorization code.");
      return;
    }

    // The code is exchanged for a token server-side inside the Edge Function,
    // using the matching CLIENT_SECRET which is stored only as a Supabase
    // function secret. This page never sees or handles that secret.
    supabase.functions
      .invoke(`${provider}-oauth-callback`, { body: { code, state } })
      .then(({ error }) => {
        if (error) {
          setStatus("error");
          setMessage(error.message ?? "Could not complete connection.");
        } else {
          setStatus("done");
          setMessage(`${provider === "youcan" ? "YouCan" : "Google"} connected.`);
          setTimeout(() => navigate("/settings"), 1200);
        }
      });
  }, [params, provider, navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-base">
      <div className="flex flex-col items-center gap-3 text-center">
        {status === "working" && <Loader2 size={22} className="animate-spin text-ink-muted" />}
        {status === "done" && <CheckCircle2 size={22} className="text-brand" />}
        {status === "error" && <XCircle size={22} className="text-danger" />}
        <div className="text-[13.5px] text-ink">{message}</div>
        {status === "error" && (
          <button
            onClick={() => navigate("/settings")}
            className="mt-1 text-[12.5px] text-ink-muted underline hover:text-ink"
          >
            Back to Settings
          </button>
        )}
      </div>
    </div>
  );
}
