import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { CheckCircle, XCircle, Loader2, Users } from "lucide-react";

type InviteStatus = "loading" | "success" | "error";

async function getInvitationError(error: unknown, data: any) {
  const raw = String(data?.error || (error as { message?: string })?.message || "");
  if (raw.includes("INVITATION_EMAIL_MISMATCH")) return "Sign in with the email address that received this invitation.";
  if (raw.includes("INVITATION_EXPIRED")) return "This invitation has expired. Ask the workspace owner for a new link.";
  if (raw.includes("INVITATION_REVOKED") || raw.includes("INVITATION_NOT_AVAILABLE")) return "This invitation is no longer available.";
  if (raw.includes("INVITATION_NOT_FOUND")) return "This invitation link is invalid.";
  if (raw.includes("INVITER_NO_LONGER_AUTHORIZED") || raw.includes("WORKSPACE_NOT_AVAILABLE")) return "This workspace can no longer accept the invitation.";
  if (raw.includes("TEAM_MEMBER_LIMIT_REACHED")) return "This workspace has reached its team member limit.";
  if (data?.error) return String(data.error);
  const response = (error as { context?: Response })?.context;
  if (response instanceof Response) {
    try {
      const payload = await response.clone().json();
      if (payload?.error) return String(payload.error);
    } catch {
      // Use the safe fallback below.
    }
  }
  return "The invitation could not be accepted. Ask the workspace owner for a new link.";
}

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
      try {
        const edgeResult = await supabase.functions.invoke("accept-team-invitation", { body: { token } });
        if (!active) return;
        // The RPC is the same authenticated, server-side transition used by
        // the Edge Function. Keeping it as a fallback lets an already-open
        // invite continue working while a function deployment propagates.
        let data = edgeResult.data;
        let error = edgeResult.error;
        if (error || !data?.success) {
          const rpcResult = await supabase.rpc("accept_workspace_invitation", { p_invitation_id: token });
          if (!rpcResult.error) {
            data = { success: true };
            error = null;
          } else {
            data = rpcResult.data ?? data;
            error = rpcResult.error ?? error;
          }
        }
        if (error || !data?.success) {
          setStatus("error");
          setMessage(await getInvitationError(error, data));
          return;
        }

        await refreshProfile();
        if (!active) return;
        setStatus("success");
        setMessage("You joined the owner's workspace. No plan or payment is required.");
        window.setTimeout(() => { if (active) navigate("/dashboard", { replace: true }); }, 900);
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessage(await getInvitationError(error, null));
      }
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
