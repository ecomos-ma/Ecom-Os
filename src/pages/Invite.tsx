import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { CheckCircle, XCircle, Loader2, Users } from "lucide-react";

type InviteStatus = "loading" | "success" | "error";

export default function Invite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { session, refreshProfile } = useAuth();
  const [status, setStatus] = useState<InviteStatus>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This invitation link is invalid.");
      return;
    }
    if (!session) {
      navigate(`/login?returnTo=${encodeURIComponent(`/invite?token=${token}`)}`, { replace: true });
      return;
    }

    let active = true;
    const accept = async () => {
      setStatus("loading");
      const { error } = await supabase.rpc("accept_workspace_invitation", { p_invitation_id: token });
      if (!active) return;
      if (error) {
        const raw = String(error.message || "");
        const known = raw.includes("INVITATION_EXPIRED") ? "This invitation has expired. Ask the workspace owner to send a new invitation."
          : raw.includes("INVITATION_REVOKED") ? "This invitation has been revoked. Ask the workspace owner to send a new invitation."
            : raw.includes("INVITATION_EMAIL_MISMATCH") ? "This invitation belongs to a different email address. Sign in with the invited email."
              : raw.includes("TEAM_MEMBER_LIMIT_REACHED") ? "This workspace has reached its team member limit. Ask the owner to upgrade or remove a member."
                : raw.includes("INVITATION_NOT_AVAILABLE") ? "This invitation is no longer available."
                  : "We could not accept this invitation.";
        setStatus("error");
        setMessage(known);
        return;
      }
      await refreshProfile();
      if (!active) return;
      setStatus("success");
      setMessage("You're in.");
      window.setTimeout(() => { if (active) navigate("/dashboard", { replace: true }); }, 700);
    };
    void accept();
    return () => { active = false; };
  }, [navigate, refreshProfile, session, token]);

  return (
    <div className="min-h-screen bg-base-surface flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-base-border bg-base-raised p-8 text-center">
        {status === "loading" && <div className="space-y-4"><Loader2 className="mx-auto h-16 w-16 animate-spin text-brand" /><h2 className="text-xl font-bold text-ink">Verifying invitation...</h2><p className="text-ink-muted">Your workspace access is being confirmed securely.</p></div>}
        {status === "success" && <div className="space-y-4"><CheckCircle className="mx-auto h-16 w-16 text-emerald-500" /><h2 className="text-xl font-bold text-ink">You're in.</h2><p className="text-ink-muted">{message}</p><Users className="mx-auto h-6 w-6 text-brand" /></div>}
        {status === "error" && <div className="space-y-4"><XCircle className="mx-auto h-16 w-16 text-danger" /><h2 className="text-xl font-bold text-ink">Invitation unavailable</h2><p className="text-ink-muted">{message}</p><button onClick={() => navigate("/login")} className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white">Go to login</button></div>}
      </div>
    </div>
  );
}
