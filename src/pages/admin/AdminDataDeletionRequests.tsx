import { useState, useEffect, FormEvent } from "react";
import { Loader2, CheckCircle2, Clock, AlertTriangle, X, Filter } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "../../components/Toast";
import type { Database } from "../../types/supabase";

type DeletionRequest = Database['public']['Tables']['data_deletion_requests']['Row'];

type StatusFilter = "all" | "requested" | "under_review" | "approved" | "rejected";
type RequestTypeFilter = "all" | "account_deletion" | "data_deletion" | "export_request";

export default function AdminDataDeletionRequests() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("requested");
  const [typeFilter, setTypeFilter] = useState<RequestTypeFilter>("all");
  const [selectedRequest, setSelectedRequest] = useState<DeletionRequest | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [userVisibleReason, setUserVisibleReason] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<DeletionRequest["status"]>("requested");

  useEffect(() => {
    loadRequests();
  }, [statusFilter, typeFilter]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("data_deletion_requests")
        .select("*")
        .order("requested_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (typeFilter !== "all") {
        query = query.eq("request_type", typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests(data || []);
    } catch (error: any) {
      toast.error("Failed to load deletion requests");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRequest = (request: DeletionRequest) => {
    setSelectedRequest(request);
    setAdminNotes(request.admin_notes || "");
    setUserVisibleReason(request.user_visible_reason || "");
    setNewStatus(request.status);
    setShowDetails(true);
  };

  const handleUpdateStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;

    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from("data_deletion_requests")
        .update({
          status: newStatus,
          admin_notes: adminNotes || null,
          user_visible_reason: userVisibleReason || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedRequest.id);

      if (error) throw error;
      toast.success(`Request updated to ${newStatus}`);
      setShowDetails(false);
      setSelectedRequest(null);
      await loadRequests();
    } catch (error: any) {
      toast.error(error.message || "Failed to update request");
    } finally {
      setUpdatingStatus(false);
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
        return <AlertTriangle size={14} />;
      case "under_review":
        return <Clock size={14} />;
      case "approved":
      case "completed":
        return <CheckCircle2 size={14} />;
      case "rejected":
        return <X size={14} />;
      default:
        return null;
    }
  };

  if (loading && requests.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-brand-accent" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ink mb-2">Data Deletion Requests</h2>
        <p className="text-ink-muted">Review and manage user data deletion and account deletion requests</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-ink-muted" />
          <span className="text-sm font-semibold text-ink-muted">Filter:</span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-base-border bg-base-raised px-3 py-1.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="requested">Requested</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as RequestTypeFilter)}
          className="rounded-lg border border-base-border bg-base-raised px-3 py-1.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
        >
          <option value="all">All Types</option>
          <option value="account_deletion">Account Deletion</option>
          <option value="data_deletion">Data Deletion</option>
          <option value="export_request">Export Request</option>
        </select>
      </div>

      {/* Requests Table */}
      <div className="rounded-xl border border-base-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-base-raised border-b border-base-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">Requested</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-border">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                    No deletion requests found
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id} className="hover:bg-base-raised/50 transition">
                    <td className="px-4 py-3 text-sm text-ink truncate">
                      {request.user_id}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink capitalize">
                      {request.request_type.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">
                      {new Date(request.requested_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(request.status)}`}>
                        {getStatusIcon(request.status)}
                        {request.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleSelectRequest(request)}
                        className="text-xs font-semibold text-brand hover:underline"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {showDetails && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-base-surface rounded-xl border border-base-border max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between border-b border-base-border bg-base-raised px-6 py-4">
              <h3 className="text-lg font-semibold text-ink">
                Review Deletion Request
              </h3>
              <button
                onClick={() => setShowDetails(false)}
                className="rounded-lg p-1 hover:bg-base-border"
              >
                <X size={20} className="text-ink-muted" />
              </button>
            </div>

            <form onSubmit={handleUpdateStatus} className="space-y-6 p-6">
              {/* Request Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase mb-1">User ID</p>
                  <p className="font-mono text-sm text-ink break-all">{selectedRequest.user_id}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase mb-1">Request Type</p>
                  <p className="text-sm text-ink capitalize">{selectedRequest.request_type.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase mb-1">Requested</p>
                  <p className="text-sm text-ink">{new Date(selectedRequest.requested_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase mb-1">Current Status</p>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(selectedRequest.status)}`}>
                    {getStatusIcon(selectedRequest.status)}
                    {selectedRequest.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              {/* Data to Delete */}
              {selectedRequest.data_to_delete && selectedRequest.data_to_delete.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase mb-2">Data to Delete</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedRequest.data_to_delete.map((item: string) => (
                      <span
                        key={item}
                        className="rounded-full bg-base-raised px-3 py-1 text-xs text-ink capitalize"
                      >
                        {item.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Update */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as DeletionRequest["status"])}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                >
                  <option value="requested">Requested</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Admin Notes */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  Admin Notes (internal only)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                  placeholder="Internal notes about this request..."
                  rows={3}
                />
              </div>

              {/* User Visible Reason */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  User Visible Response (shown to user)
                </label>
                <textarea
                  value={userVisibleReason}
                  onChange={(e) => setUserVisibleReason(e.target.value)}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                  placeholder="If rejected, explain why. If approved, confirm next steps..."
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 border-t border-base-border pt-6">
                <button
                  type="submit"
                  disabled={updatingStatus}
                  className="flex items-center justify-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition flex-1"
                >
                  {updatingStatus && <Loader2 size={16} className="animate-spin" />}
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="rounded-lg border border-base-border px-6 py-2.5 text-sm font-semibold text-ink-muted hover:bg-base-raised transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
