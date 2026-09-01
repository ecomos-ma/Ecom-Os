import { useState, useEffect, FormEvent } from "react";
import { Loader2, CheckCircle2, Clock, AlertTriangle, X, Filter, DollarSign } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "../../components/Toast";
import type { Database } from "../../types/supabase";

type RefundRequest = Database['public']['Tables']['refund_requests']['Row'];
type RefundStatus = "pending" | "under_review" | "approved" | "rejected" | "processed";

export default function AdminRefundRequests() {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RefundStatus | "all">("pending");
  const [selectedRequest, setSelectedRequest] = useState<RefundRequest | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [adminResponse, setAdminResponse] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<RefundStatus>("pending");

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("refund_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests(data || []);
    } catch (error: any) {
      toast.error("Failed to load refund requests");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRequest = (request: RefundRequest) => {
    setSelectedRequest(request);
    setAdminResponse(request.admin_response || "");
    setNewStatus(request.status as RefundStatus);
    setShowDetails(true);
  };

  const handleUpdateStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;

    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from("refund_requests")
        .update({
          status: newStatus,
          admin_response: adminResponse || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: (await supabase.auth.getUser()).data.user?.id || null,
        })
        .eq("id", selectedRequest.id);

      if (error) throw error;
      toast.success(`Refund request updated to ${newStatus}`);
      setShowDetails(false);
      setSelectedRequest(null);
      await loadRequests();
    } catch (error: any) {
      toast.error(error.message || "Failed to update refund request");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusColor = (status: RefundStatus) => {
    switch (status) {
      case "pending":
        return "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200";
      case "under_review":
        return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200";
      case "approved":
        return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200";
      case "processed":
        return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200";
      case "rejected":
        return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200";
      default:
        return "bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-200";
    }
  };

  const getStatusIcon = (status: RefundStatus) => {
    switch (status) {
      case "pending":
        return <Clock size={14} />;
      case "under_review":
        return <AlertTriangle size={14} />;
      case "approved":
      case "processed":
        return <CheckCircle2 size={14} />;
      case "rejected":
        return <X size={14} />;
      default:
        return null;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "MAD",
    }).format(amount);
  };

  if (loading && requests.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-brand-accent" size={24} />
      </div>
    );
  }

  const totalAmount = requests
    .filter((r) => r.status === "approved" || r.status === "processed")
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ink mb-2">Refund Requests</h2>
        <p className="text-ink-muted">Review and manage user refund requests</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-base-border bg-base-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-ink-muted uppercase">Total Pending</p>
              <p className="text-xl font-bold text-ink mt-1">
                {requests.filter((r) => r.status === "pending").length}
              </p>
            </div>
            <Clock size={24} className="text-blue-500" />
          </div>
        </div>
        <div className="rounded-xl border border-base-border bg-base-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-ink-muted uppercase">Under Review</p>
              <p className="text-xl font-bold text-ink mt-1">
                {requests.filter((r) => r.status === "under_review").length}
              </p>
            </div>
            <AlertTriangle size={24} className="text-amber-500" />
          </div>
        </div>
        <div className="rounded-xl border border-base-border bg-base-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-ink-muted uppercase">Approved Amount</p>
              <p className="text-lg font-bold text-emerald-600 mt-1">
                {formatCurrency(totalAmount)}
              </p>
            </div>
            <DollarSign size={24} className="text-emerald-500" />
          </div>
        </div>
        <div className="rounded-xl border border-base-border bg-base-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-ink-muted uppercase">Rejected</p>
              <p className="text-xl font-bold text-ink mt-1">
                {requests.filter((r) => r.status === "rejected").length}
              </p>
            </div>
            <X size={24} className="text-red-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter size={16} className="text-ink-muted" />
        <span className="text-sm font-semibold text-ink-muted">Filter:</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="rounded-lg border border-base-border bg-base-raised px-3 py-1.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="processed">Processed</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Requests Table */}
      <div className="rounded-xl border border-base-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-base-raised border-b border-base-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">Payment Reference</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-muted">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">Requested</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-muted">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-border">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                    No refund requests found
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id} className="hover:bg-base-raised/50 transition">
                    <td className="px-4 py-3 text-sm text-ink truncate">
                      {request.user_id}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted font-mono truncate">
                      {request.payment_reference || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink text-right font-semibold">
                      {formatCurrency(request.amount || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">
                      {new Date(request.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(request.status as RefundStatus)}`}>
                        {getStatusIcon(request.status as RefundStatus)}
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
                Review Refund Request
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
                  <p className="text-xs font-semibold text-ink-muted uppercase mb-1">Amount</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {formatCurrency(selectedRequest.amount || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase mb-1">Payment Reference</p>
                  <p className="font-mono text-sm text-ink">{selectedRequest.payment_reference || "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase mb-1">Current Status</p>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(selectedRequest.status as RefundStatus)}`}>
                    {getStatusIcon(selectedRequest.status as RefundStatus)}
                    {selectedRequest.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              {/* Reason */}
              {selectedRequest.reason && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase mb-2">Refund Reason</p>
                  <p className="text-sm text-ink bg-base-raised rounded-lg px-3 py-2">
                    {selectedRequest.reason}
                  </p>
                </div>
              )}

              {/* Status Update */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as RefundStatus)}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                >
                  <option value="pending">Pending</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="processed">Processed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Admin Response */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  Admin Response (sent to user)
                </label>
                <textarea
                  value={adminResponse}
                  onChange={(e) => setAdminResponse(e.target.value)}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                  placeholder="Explain approval or reason for rejection..."
                  rows={4}
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
