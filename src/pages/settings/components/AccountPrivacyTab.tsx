import { FormEvent, useState, useEffect } from "react";
import { AlertTriangle, Loader2, Mail, Check, Clock, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import { toast } from "../../../components/Toast";
import type { Database } from "../../../types/supabase";

type DeletionRequest = Database['public']['Tables']['data_deletion_requests']['Row'];

export default function AccountPrivacyTab() {
  const { profile, session } = useAuth();
  const [tab, setTab] = useState<"privacy" | "account">("privacy");
  
  // Data Deletion
  const [showDeletionRequest, setShowDeletionRequest] = useState(false);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [submittingDeletion, setSubmittingDeletion] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);

  // Account Deletion
  const [showAccountDeletion, setShowAccountDeletion] = useState(false);
  const [accountDeleteStep, setAccountDeleteStep] = useState<"confirm" | "verify">("confirm");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Load deletion requests
  useEffect(() => {
    void loadDeletionRequests();
  }, [session?.user.id]);

  const loadDeletionRequests = async () => {
    if (!session?.user.id) return;
    setLoadingRequests(true);
    try {
      const { data, error } = await supabase
        .from("data_deletion_requests")
        .select("*")
        .eq("user_id", session.user.id)
        .order("requested_at", { ascending: false });
      if (error) throw error;
      setDeletionRequests(data || []);
    } catch (error: any) {
      toast.error("Failed to load deletion requests");
      console.error(error);
    } finally {
      setLoadingRequests(false);
    }
  };

  const submitDeletionRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!session?.user.id) return;

    // Check for active deletion request
    const activeRequest = deletionRequests.find(
      (r) => !["completed", "rejected"].includes(r.status)
    );
    if (activeRequest) {
      toast.error("You already have an active deletion request");
      return;
    }

    setSubmittingDeletion(true);
    try {
      const { error } = await supabase.from("data_deletion_requests").insert({
        user_id: session.user.id,
        request_type: "data_deletion",
        reason: deletionReason || undefined,
        status: "requested",
        data_to_delete: ["account_data", "personal_preferences"],
      });
      if (error) throw error;
      toast.success("Data deletion request submitted. We'll review it shortly.");
      setShowDeletionRequest(false);
      setDeletionReason("");
      setDeletionConfirmed(false);
      await loadDeletionRequests();
    } catch (error: any) {
      toast.error(error.message || "Failed to submit deletion request");
    } finally {
      setSubmittingDeletion(false);
    }
  };

  const submitAccountDeletion = async (e: FormEvent) => {
    e.preventDefault();
    if (!session?.user.id) return;

    if (deleteConfirmText !== "DELETE") {
      toast.error("Please type DELETE to confirm account deletion");
      return;
    }

    setSubmittingDelete(true);
    try {
      // Create account deletion request in the system
      const { error: reqError } = await supabase.from("data_deletion_requests").insert({
        user_id: session.user.id,
        request_type: "account_deletion",
        status: "requested",
        data_to_delete: [
          "account_data",
          "workspace_data",
          "personal_preferences",
          "all_integrations",
        ],
      });
      if (reqError) throw reqError;

      toast.success(
        "Account deletion request submitted. You will receive confirmation via email."
      );
      setShowAccountDeletion(false);
      setDeleteConfirmText("");
      setAccountDeleteStep("confirm");
      await loadDeletionRequests();
    } catch (error: any) {
      toast.error(error.message || "Failed to submit account deletion request");
    } finally {
      setSubmittingDelete(false);
    }
  };

  const getStatusColor = (status: DeletionRequest["status"]) => {
    switch (status) {
      case "requested":
        return "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200";
      case "under_review":
        return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200";
      case "approved":
        return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200";
      case "processing":
        return "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-200";
      case "completed":
        return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200";
      case "rejected":
        return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200";
      default:
        return "bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-200";
    }
  };

  const getStatusIcon = (status: DeletionRequest["status"]) => {
    switch (status) {
      case "requested":
        return <Mail size={14} />;
      case "under_review":
        return <Clock size={14} />;
      case "approved":
      case "completed":
        return <Check size={14} />;
      case "rejected":
        return <X size={14} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 max-w-lg">
      {/* Tabs */}
      <div className="flex gap-2 rounded-lg border border-base-border bg-base-surface p-1">
        <button
          onClick={() => setTab("privacy")}
          className={`flex-1 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            tab === "privacy"
              ? "bg-base-raised text-ink"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          Privacy
        </button>
        <button
          onClick={() => setTab("account")}
          className={`flex-1 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            tab === "account"
              ? "bg-base-raised text-ink"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          Account
        </button>
      </div>

      {/* Privacy Tab */}
      {tab === "privacy" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-base-border bg-base-surface p-5">
            <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-ink">
              <Mail size={15} /> Data Deletion Request
            </h3>
            <p className="mb-4 text-[13px] text-ink-muted leading-6">
              Request the deletion of your personal account data. Note that some information may be retained for legal, security, or billing purposes.
            </p>
            {!showDeletionRequest ? (
              <button
                onClick={() => setShowDeletionRequest(true)}
                className="rounded-lg bg-brand px-4 py-2.5 text-[12px] font-semibold text-white hover:opacity-90 transition"
              >
                Request Data Deletion
              </button>
            ) : (
              <form onSubmit={submitDeletionRequest} className="space-y-4 border-t border-base-border/60 pt-4">
                <div>
                  <label className="block text-[12px] font-semibold text-ink mb-2">
                    Reason (optional)
                  </label>
                  <textarea
                    value={deletionReason}
                    onChange={(e) => setDeletionReason(e.target.value)}
                    placeholder="Why would you like your data deleted?"
                    className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                    rows={3}
                  />
                </div>
                <label className="flex items-start gap-3 text-[12px] text-ink-muted">
                  <input
                    type="checkbox"
                    checked={deletionConfirmed}
                    onChange={(e) => setDeletionConfirmed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I understand that this request will be reviewed and may permanently remove my personal data after approval.
                  </span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!deletionConfirmed || submittingDeletion}
                    className="flex-1 rounded-lg bg-brand px-3 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50 hover:opacity-90 transition flex items-center justify-center gap-2"
                  >
                    {submittingDeletion && <Loader2 size={14} className="animate-spin" />}
                    Submit Request
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeletionRequest(false);
                      setDeletionReason("");
                      setDeletionConfirmed(false);
                    }}
                    className="rounded-lg border border-base-border px-3 py-2.5 text-[12px] font-semibold text-ink-muted hover:text-ink hover:bg-base-raised transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Deletion Request History */}
          {loadingRequests ? (
            <div className="rounded-xl border border-base-border bg-base-surface p-5 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin text-ink-muted" />
              <span className="text-[12px] text-ink-muted">Loading requests...</span>
            </div>
          ) : deletionRequests.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[12px] font-semibold text-ink-muted uppercase tracking-wide">
                Request History
              </p>
              {deletionRequests.map((request) => (
                <div
                  key={request.id}
                  className={`rounded-lg border p-4 text-[12px] ${getStatusColor(request.status)}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(request.status)}
                      <strong className="capitalize">{request.status.replace(/_/g, " ")}</strong>
                    </div>
                    <span className="text-[11px] opacity-75">
                      {new Date(request.requested_at).toLocaleDateString()}
                    </span>
                  </div>
                  {request.user_visible_reason && (
                    <p className="text-[11px] mt-2 opacity-90">{request.user_visible_reason}</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Account Tab */}
      {tab === "account" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-danger/25 bg-danger/5 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-danger/10 text-danger">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-danger mb-1">
                  Danger Zone
                </h3>
                <p className="text-[12px] text-ink-muted leading-5">
                  Deleting your account is permanent and cannot be undone. All your workspaces, data, and settings will be marked for deletion.
                </p>
              </div>
            </div>

            {!showAccountDeletion ? (
              <button
                onClick={() => setShowAccountDeletion(true)}
                className="rounded-lg bg-danger px-4 py-2.5 text-[12px] font-semibold text-white hover:opacity-90 transition"
              >
                Delete Account
              </button>
            ) : (
              <div className="border-t border-danger/25 pt-4">
                {accountDeleteStep === "confirm" && (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-danger/10 border border-danger/25 p-4">
                      <p className="text-[12px] text-ink leading-6 mb-3">
                        <strong>This action cannot be reversed.</strong> Deleting your account will:
                      </p>
                      <ul className="space-y-1 text-[12px] text-ink ml-3">
                        <li>• Remove your access to Ecom OS</li>
                        <li>• Mark your account and data for deletion</li>
                        <li>• Cancel any active subscriptions</li>
                        <li>• Disconnect all integrations</li>
                      </ul>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAccountDeleteStep("verify")}
                        className="flex-1 rounded-lg bg-danger px-3 py-2.5 text-[12px] font-semibold text-white hover:opacity-90 transition"
                      >
                        I Understand, Continue
                      </button>
                      <button
                        onClick={() => setShowAccountDeletion(false)}
                        className="rounded-lg border border-base-border px-3 py-2.5 text-[12px] font-semibold text-ink-muted hover:bg-base-raised transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {accountDeleteStep === "verify" && (
                  <form onSubmit={submitAccountDeletion} className="space-y-4">
                    <div>
                      <label className="block text-[12px] font-semibold text-ink mb-2">
                        Type "DELETE" to confirm
                      </label>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                        placeholder="DELETE"
                        className="w-full rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-[12px] font-mono font-bold text-danger focus:border-danger focus:ring-2 focus:ring-danger/15 outline-none"
                      />
                      <p className="mt-2 text-[11px] text-ink-muted">
                        This will permanently delete your Ecom OS account and schedule your data for removal.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={deleteConfirmText !== "DELETE" || submittingDelete}
                        className="flex-1 rounded-lg bg-danger px-3 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50 hover:opacity-90 transition flex items-center justify-center gap-2"
                      >
                        {submittingDelete && <Loader2 size={14} className="animate-spin" />}
                        Delete My Account
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAccountDeletion(false);
                          setAccountDeleteStep("confirm");
                          setDeleteConfirmText("");
                        }}
                        className="rounded-lg border border-base-border px-3 py-2.5 text-[12px] font-semibold text-ink-muted hover:bg-base-raised transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
