import { useCallback, useState, useEffect, useRef, memo } from "react";
import { CheckCircle2, MoreHorizontal } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import WhatsAppSettingsModal from "./WhatsAppSettingsModal";
import { toast } from "../../../components/Toast";
import { disconnectWhatsApp } from "../../../services/whatsappWorkerService";

function WhatsAppIntegrationCard() {
    const { workspace } = useAuth();
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<any>(null);
    const [refreshError, setRefreshError] = useState(false);
    const [isManageOpen, setIsManageOpen] = useState(false);
    const requestRef = useRef<Promise<void> | null>(null);

    const loadSettings = useCallback(async () => {
        const workspaceId = workspace?.id;
        if (!workspaceId) return;
        if (requestRef.current) return requestRef.current;

        const request = (async () => {
            try {
                const { data, error } = await supabase
                    .from("whatsapp_settings")
                    .select("*")
                    .eq("workspace_id", workspaceId)
                    .maybeSingle();
                if (error) throw error;
                if (data) setSettings(data);
                setRefreshError(false);
            } catch (e) {
                console.error("Error loading WhatsApp config:", e);
                setRefreshError(true);
            } finally {
                setLoading(false);
                requestRef.current = null;
            }
        })();

        requestRef.current = request;
        return request;
    }, [workspace?.id]);

    useEffect(() => {
        let sub: any;
        void loadSettings();

        // Set up realtime subscription separately
        if (workspace) {
            sub = supabase.channel(`whatsapp_realtime_${workspace.id}`)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "whatsapp_settings", filter: `workspace_id=eq.${workspace.id}` },
                    (payload) => setSettings(payload.new)
                )
                .subscribe();
        }

        return () => {
            if (sub) { supabase.removeChannel(sub); }
        };
    }, [loadSettings, workspace?.id]);

    const isConnected = ["ready", "authenticated", "connected"].includes(String(settings?.connection_status || ""));

    const handleDisconnect = async () => {
        if (!workspace?.id || !confirm("Disconnect WhatsApp? Session will be terminated.")) return;
        try {
            await disconnectWhatsApp(workspace.id);
            toast.success("WhatsApp disconnected");
            await loadSettings();
        } catch (e) {
            console.error("Failed to disconnect WhatsApp:", e);
            toast.error(e instanceof Error ? e.message : "Failed to disconnect WhatsApp");
        }
    };

    return (
        <>
            <div className="group relative flex min-h-[274px] flex-col h-full overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150">
                <div className="absolute right-4 top-4">
                    <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
                </div>

                <div className="flex flex-col pb-4">
                    {/* Icon */}
                    <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
                        <img src={getIntegrationLogo("whatsapp") || ""} alt="WhatsApp" className="h-full w-full object-contain object-center" />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">WhatsApp Automation</h3>
                        <div className="flex items-center">
                            {loading ? (
                                <span className="flex h-[22px] w-28 animate-pulse rounded-full bg-base-raised" />
                            ) : isConnected ? (
                                <span className="flex h-[22px] items-center gap-1 rounded-full bg-[#10B981]/15 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-[#10B981]">
                                    <CheckCircle2 size={11} strokeWidth={2.5} /> Connected
                                </span>
                            ) : (
                                <span className="flex h-[22px] items-center rounded-full bg-base-raised px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                                    Not Connected
                                </span>
                            )}
                        </div>
                    </div>

                    <p className="mt-3 text-[13px] leading-relaxed text-ink-muted min-h-[40px] flex-1">
                        Automate transactional order confirmations and process customer replies directly.
                    </p>
                </div>

                <div className="mt-auto border-t border-base-border/60 pt-4">
                    <div className="mb-2 h-[16px]">
                        {refreshError && !loading && (
                            <button onClick={() => void loadSettings()} className="text-left text-[11px] leading-4 text-ink-muted hover:text-brand transition-colors">
                                Status refresh failed. Retry
                            </button>
                        )}
                    </div>
                    {loading ? (
                        <div className="h-[38px] w-full animate-pulse rounded-xl bg-base-raised" />
                    ) : isConnected ? (
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={handleDisconnect}
                                className="h-[38px] rounded-xl bg-base-raised px-3 text-[13px] font-semibold text-ink hover:text-danger hover:bg-danger/10 transition-colors"
                            >
                                Disconnect
                            </button>
                            <button
                                onClick={() => setIsManageOpen(true)}
                                className="h-[38px] rounded-xl border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
                            >
                                Manage
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsManageOpen(true)}
                            className="h-[38px] w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
                        >
                            Connect
                        </button>
                    )}
                </div>
            </div>

            {isManageOpen && (
                <WhatsAppSettingsModal
                    isOpen={isManageOpen}
                    onClose={() => setIsManageOpen(false)}
                    initialSettings={settings}
                />
            )}
        </>
    );
}

export default memo(WhatsAppIntegrationCard);
