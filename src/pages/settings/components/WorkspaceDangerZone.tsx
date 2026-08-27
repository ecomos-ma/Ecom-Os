import React, { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";

export default function WorkspaceDangerZone() {
    const { workspace, profile, refreshProfile } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [isResetting, setIsResetting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Note: We use profile?.role to check for edit permissions, similar to Settings.tsx
    const isOwner = profile && (profile.role === "owner" || profile.role === "super_admin" || profile.role === "founder");
    if (!isOwner) return null;

    const expectedConfirmText = `RESET ${workspace?.name}`;

    const handleReset = async () => {
        if (confirmText !== expectedConfirmText) return;
        if (!workspace?.id) return;

        setIsResetting(true);
        setError(null);
        try {
            const { error: rpcError } = await supabase.rpc("reset_workspace_data", { p_workspace_id: workspace.id });
            if (rpcError) {
                console.error("[WorkspaceReset] RPC error:", rpcError);
                setError("Workspace reset failed. Your workspace was not changed. Please try again.");
                setIsResetting(false);
                return;
            }
            window.location.href = "/";
        } catch (err: any) {
            console.error("[WorkspaceReset] Caught error:", err);
            setError("Workspace reset failed. Please try again.");
            setIsResetting(false);
        }
    };

    return (
        <>
            <div className="mt-8 rounded-2xl border border-danger/20 bg-danger/5 p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-danger/10 text-danger">
                            <AlertTriangle size={18} />
                        </div>
                        <div>
                            <div className="text-[14px] font-semibold text-danger">Danger Zone</div>
                            <div className="mt-1 text-[12px] leading-5 text-ink-muted">
                                Permanently remove all operational data from this workspace while preserving your integrations.
                                Your workspace name, team, and API credentials will remain.
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="inline-flex items-center justify-center rounded-xl bg-danger/10 px-4 py-2 text-[12px] font-semibold text-danger outline-none transition-colors hover:bg-danger hover:text-white"
                    >
                        Reset workspace
                    </button>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-2xl">
                        <div className="p-6">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-danger/10 text-danger">
                                    <AlertTriangle size={20} />
                                </div>
                                <h3 className="text-[17px] font-semibold text-ink">Reset workspace data?</h3>
                            </div>

                            <div className="text-[13px] text-ink-muted leading-relaxed mb-4">
                                This will permanently remove all operational data from this workspace, including orders, customers, products, inventory, expenses, shipping data, statuses, and synchronization history.
                                <br /><br />
                                Your integrations (YouCan, Coliaty, Ozon, WhatsApp, Google Sheets) will remain connected and their credentials will be preserved.<br /><br />
                                The workspace itself, its name, owner and identity will remain.
                            </div>

                            <div className="mb-4 rounded-xl bg-base-raised p-4">
                                <div className="mb-2 text-[12px] font-medium text-ink">Will be deleted/reset:</div>
                                <ul className="text-[12px] text-ink-muted list-disc list-inside space-y-1">
                                    <li>Orders and order history</li>
                                    <li>Customers and CRM data</li>
                                    <li>Products and inventory</li>
                                    <li>Shipping and tracking data</li>
                                    <li>Finance and expenses</li>
                                    <li>Ads and analytics</li>
                                    <li>Notifications and automation logs</li>
                                    <li>WhatsApp messages and conversation history</li>
                                    <li>Operational workspace configuration</li>
                                    <li>Integration sync history (connections preserved)</li>
                                </ul>
                            </div>

                            <div className="mb-4 rounded-xl bg-success/5 p-4">
                                <div className="mb-2 text-[12px] font-medium text-success">Will be preserved:</div>
                                <ul className="text-[12px] text-ink-muted list-disc list-inside space-y-1">
                                    <li>Workspace name and identity</li>
                                    <li>Team members and their access</li>
                                    <li>YouCan OAuth tokens and credentials</li>
                                    <li>Coliaty/Ozon API keys and configuration</li>
                                    <li>WhatsApp connection settings and automation rules</li>
                                    <li>Google Sheets credentials and setup</li>
                                </ul>
                            </div>

                            {error && (
                                <div className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-[12px] text-danger">
                                    {error}
                                </div>
                            )}

                            {isResetting ? (
                                <div className="flex flex-col items-center justify-center py-6 text-ink-muted">
                                    <Loader2 size={24} className="mb-3 animate-spin text-brand-accent" />
                                    <p className="text-[13px] font-medium text-ink">Resetting workspace…</p>
                                    <p className="mt-1 text-[11px]">Cleaning workspace data while preserving your integrations. Do not close this page.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-2 text-[13px] font-medium text-ink">
                                        To confirm, type: <span className="select-all font-mono font-bold bg-danger/10 text-danger px-1 rounded">{expectedConfirmText}</span>
                                    </div>
                                    <input
                                        type="text"
                                        value={confirmText}
                                        onChange={(e) => setConfirmText(e.target.value)}
                                        placeholder={expectedConfirmText}
                                        className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-2.5 text-[13px] text-ink focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger"
                                    />
                                </>
                            )}
                        </div>

                        {!isResetting && (
                            <div className="flex items-center justify-end gap-3 border-t border-base-border bg-base-raised/30 px-6 py-4">
                                <button
                                    type="button"
                                    onClick={() => { setShowModal(false); setConfirmText(""); setError(null); }}
                                    className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-base-border hover:text-ink"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    disabled={confirmText !== expectedConfirmText || isResetting}
                                    className="rounded-xl border border-transparent bg-danger px-4 py-2.5 text-[13px] font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                                >
                                    Reset workspace permanently
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
