import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { toast } from "../components/Toast";
import { CheckCircle, XCircle, Loader2, Users, Shield } from "lucide-react";

export default function Invite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { session, refreshProfile } = useAuth();
  
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid invitation link");
      return;
    }

    if (!session) {
      // Redirect to login with return URL
      navigate(`/login?returnTo=${encodeURIComponent(`/invite?token=${token}`)}`);
      return;
    }

    acceptInvitation();
  }, [token, session]);

  const acceptInvitation = async () => {
    try {
      setStatus("loading");
      
      if (!session?.user?.id || !session?.user?.email) {
        throw new Error("You must be logged in to accept an invitation");
      }
      
      // Find the invitation by token
      const { data: invitation, error: inviteError } = await supabase
        .from("workspace_invitations")
        .select("*")
        .eq("id", token)
        .single();

      if (inviteError || !invitation) {
        throw new Error("Invalid or expired invitation");
      }

      if (invitation.status !== "pending") {
        throw new Error("Invitation already processed");
      }

      // Check if the email matches the invitation email
      if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new Error("This invitation was sent to a different email address");
      }

      // Check if user already has a profile for this workspace
      const { data: existingMembership } = await supabase
        .from("profile_workspaces")
        .select("*")
        .eq("profile_id", session.user.id)
        .eq("workspace_id", invitation.workspace_id)
        .single();

      if (existingMembership) {
        throw new Error("You're already a member of this workspace");
      }

      // Create profile_workspaces entry
      const { error: membershipError } = await supabase
        .from("profile_workspaces")
        .insert({
          profile_id: session.user.id,
          workspace_id: invitation.workspace_id,
          is_owner: false,
          role: invitation.role,
          status: "active",
        });

      if (membershipError) {
        console.error("Error creating membership:", membershipError);
        throw new Error("Failed to create workspace membership");
      }

      // Update user profile with workspace info and permissions
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          workspace_id: invitation.workspace_id,
          role: invitation.role,
          allowed_sections: invitation.allowed_sections,
        })
        .eq("id", session.user.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }

      // Mark invitation as accepted
      const { error: updateError } = await supabase
        .from("workspace_invitations")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
          user_id: session.user.id,
        })
        .eq("id", token);

      if (updateError) {
        console.error("Error updating invitation status:", updateError);
      }

      // Get workspace info
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", invitation.workspace_id)
        .single();

      setWorkspaceName(workspace?.name || "the workspace");
      setStatus("success");
      setMessage("You've successfully joined the team!");

      // Refresh the user's profile to get the new workspace
      await refreshProfile();

      // Redirect to dashboard after a delay
      setTimeout(() => {
        navigate("/dashboard");
      }, 3000);
    } catch (error: any) {
      console.error("Invitation acceptance error:", error);
      setStatus("error");
      setMessage(error.message || "Failed to accept invitation");
    }
  };

  return (
    <div className="min-h-screen bg-base-surface flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-base-raised rounded-2xl border border-base-border p-8 text-center">
          {status === "loading" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <Loader2 className="h-16 w-16 text-brand animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-ink">Accepting Invitation...</h2>
              <p className="text-ink-muted">Please wait while we set up your workspace access.</p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-emerald-400" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-ink">Welcome to the Team!</h2>
              <p className="text-ink-muted">{message}</p>
              {workspaceName && (
                <div className="bg-base-surface rounded-xl p-4 border border-base-border">
                  <div className="flex items-center justify-center gap-2 text-ink">
                    <Users className="h-5 w-5" />
                    <span className="font-medium">{workspaceName}</span>
                  </div>
                </div>
              )}
              <p className="text-sm text-ink-muted">Redirecting to dashboard...</p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-danger/20 flex items-center justify-center">
                  <XCircle className="h-10 w-10 text-danger" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-ink">Invitation Error</h2>
              <p className="text-ink-muted">{message}</p>
              <div className="space-y-2 pt-4">
                <button
                  onClick={() => navigate("/dashboard")}
                  className="w-full rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-medium text-white hover:bg-brand/90 transition-colors"
                >
                  Go to Dashboard
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-2.5 text-[13.5px] font-medium text-ink hover:bg-base-border transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}