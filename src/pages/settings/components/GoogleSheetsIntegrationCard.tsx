import { useState, useEffect } from "react";
import { CheckCircle2, Loader2, ExternalLink, X, ChevronRight, ChevronDown, RefreshCw, AlertTriangle } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/Toast";
import GoogleSheetsMappingModal from "./GoogleSheetsMappingModal";

function GoogleSheetsIntegrationCard() {
  const { workspace, refreshProfile } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [webAppUrl, setWebAppUrl] = useState("");
  const [credentials, setCredentials] = useState<any>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [editingWebAppUrl, setEditingWebAppUrl] = useState(false);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; processed: number; errors: number } | null>(null);

  useEffect(() => {
    loadCredentials();
  }, [workspace?.id]);

  const loadCredentials = async () => {
    if (!workspace?.id) return;
    
    const { data, error } = await supabase
      .from("google_sheets_credentials")
      .select("*")
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (data && !error) {
      setCredentials(data);
      setWebAppUrl(data.web_app_url || "");
    }
  };

  const extractSheetId = (url: string): string | null => {
    try {
      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  const handleConnect = async () => {
    if (!workspace?.id || !webAppUrl.trim()) {
      toast.error("Please enter a Web App URL");
      return;
    }

    setConnecting(true);

    try {
      const { data, error } = await supabase
        .from("google_sheets_credentials")
        .upsert({
          workspace_id: workspace.id,
          sheet_url: "",
          sheet_id: extractSheetId(webAppUrl) || "manual",
          webhook_token: crypto.randomUUID(),
          web_app_url: webAppUrl.trim(),
        }, {
          onConflict: "workspace_id",
        })
        .select()
        .single();

      if (error) throw error;

      setCredentials(data);
      toast.success("Google Sheets connected successfully!");
      await refreshProfile();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleTestConnection = async () => {
    if (!webAppUrl.trim()) {
      toast.error("Web App URL is required");
      return;
    }

    setTestingConnection(true);
    setConnectionStatus('checking');

    try {
      const response = await fetch(webAppUrl.trim(), {
        method: "GET",
        headers: { "Accept": "application/json" },
        redirect: "follow",
      });

      if (response.ok) {
        setConnectionStatus('connected');
        toast.success("Connection successful");
      } else {
        setConnectionStatus('error');
        toast.error("Unable to reach Web App");
      }
    } catch (error: any) {
      setConnectionStatus('error');
      toast.error("Connection failed");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSync = async () => {
    if (!workspace?.id) {
      toast.error("Workspace not found");
      return;
    }

    setSyncing(true);
    setSyncResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('sync-google-sheets-orders', {
        body: { workspace_id: workspace.id }
      });

      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
          }
        } catch {}
        toast.error(`Sync error: ${detail}`);
        return;
      }

      setSyncResult({
        created: data?.stats?.created || 0,
        updated: data?.stats?.updated || 0,
        processed: data?.stats?.processed || 0,
        errors: data?.stats?.errors || 0,
      });

      if (data?.stats?.created > 0) {
        toast.success(`${data.stats.created} new orders imported`);
      } else if (data?.stats?.updated > 0) {
        toast.success(`${data.stats.updated} orders updated`);
      } else {
        toast.success("Everything is up to date");
      }
    } catch (error: any) {
      toast.error(`Sync error: ${error?.message || "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect Google Sheets? This will remove your connection and mapping configuration.")) return;

    try {
      const { error } = await supabase
        .from("google_sheets_credentials")
        .delete()
        .eq("workspace_id", workspace?.id);

      if (error) throw error;
      
      setCredentials(null);
      setWebAppUrl("");
      await refreshProfile();
      toast.success("Google Sheets disconnected");
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const truncateUrl = (url: string, maxLength = 40) => {
    if (!url) return "";
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + "…";
  };

  const getMappingStatus = () => {
    if (!credentials?.field_mappings || credentials.field_mappings.length === 0) {
      return { mapped: 0, total: 0, needsReview: 0 };
    }
    const mapped = credentials.field_mappings.filter((m: any) => m.destinationField && m.destinationField !== 'do_not_import').length;
    const needsReview = credentials.field_mappings.filter((m: any) => m.confidence === 'needs_review').length;
    return { mapped, total: credentials.field_mappings.length, needsReview };
  };

  const mappingStatus = getMappingStatus();

  return (
    <>
      {/* ── Card ── */}
      <div className="group relative flex flex-col h-full overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150">
        <div className="absolute right-4 top-4">
          <button className="text-ink-faint hover:text-ink transition-colors"><ExternalLink size={18} /></button>
        </div>

        <div className="flex flex-col pb-4">
          <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
            <img src={getIntegrationLogo("google_sheets") || ""} alt="Google Sheets" className="h-full w-full object-contain object-center" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">Google Sheets</h3>
            <div className="flex items-center">
              {credentials ? (
                <span className="flex h-[22px] items-center gap-1.5 rounded-full bg-[#10B981]/15 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-[#10B981]">
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
            Import and sync orders from your Google Sheet using Apps Script.
          </p>
        </div>

        <div className="mt-auto border-t border-base-border/60 pt-4">
          {credentials ? (
            <button
              onClick={() => setManageOpen(true)}
              className="h-[38px] w-full flex items-center justify-center gap-1.5 rounded-xl border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
            >
              Manage
            </button>
          ) : (
            <button
              onClick={() => setManageOpen(true)}
              className="h-[38px] w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* ── Manage Modal ── */}
      {manageOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setManageOpen(false)} />
          <div className="relative z-10 w-full max-w-[700px] rounded-[24px] border border-base-border bg-base-surface shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-5 border-b border-base-border/60 bg-base-raised/30">
              <div className="h-10 w-10 rounded-xl overflow-hidden border border-base-border/50 flex-shrink-0">
                <img src={getIntegrationLogo("google_sheets") || ""} alt="Google Sheets" className="h-full w-full object-contain" />
              </div>
              <div className="flex-1">
                <h2 className="text-[17px] font-bold text-ink">Google Sheets</h2>
                <p className="text-[12px] text-ink-muted">Import and sync orders from your sheet</p>
              </div>
              <div className="flex items-center gap-2">
                {credentials && (
                  <span className="flex h-[20px] items-center gap-1 rounded-full bg-[#10B981]/15 px-2 text-[10px] font-bold uppercase tracking-wider text-[#10B981]">
                    <CheckCircle2 size={10} strokeWidth={2.5} /> Connected
                  </span>
                )}
                <button onClick={() => setManageOpen(false)} className="rounded-full bg-base-raised p-1.5 text-ink-faint hover:text-ink hover:bg-base-border transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {!credentials ? (
                <div className="p-6">
                  <div className="mb-6">
                    <h3 className="text-[14px] font-semibold text-ink mb-3">Connect Google Sheets</h3>
                    <p className="text-[13px] text-ink-muted mb-4">
                      Use your Google Apps Script Web App URL to import and sync your orders.
                    </p>
                    <div>
                      <label className="block text-[12px] font-medium text-ink mb-2">Web App URL</label>
                      <input
                        type="text"
                        value={webAppUrl}
                        onChange={(e) => setWebAppUrl(e.target.value)}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand/20"
                      />
                    </div>
                  </div>
                  <div className="text-center py-3">
                    <button
                      onClick={handleConnect}
                      disabled={connecting || !webAppUrl.trim()}
                      className="h-[36px] inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors disabled:opacity-60"
                    >
                      {connecting ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : "Connect Google Sheets"}
                    </button>
                  </div>
                  <div className="text-center mt-4">
                    <button
                      onClick={() => setSetupGuideOpen(!setupGuideOpen)}
                      className="text-[12px] text-brand hover:underline inline-flex items-center gap-1"
                    >
                      <ChevronDown size={14} className={setupGuideOpen ? "rotate-180" : ""} />
                      Need help setting it up?
                    </button>
                  </div>
                  {setupGuideOpen && (
                    <div className="mt-4 p-4 rounded-lg bg-base-raised/50 border border-base-border/60">
                      <h4 className="text-[13px] font-semibold text-ink mb-3">Setup guide</h4>
                      <ol className="text-[12px] text-ink-muted space-y-2 list-decimal list-inside">
                        <li>Open your Google Sheet</li>
                        <li>Go to Extensions → Apps Script</li>
                        <li>Deploy as Web App (doGet)</li>
                        <li>Set access to "Anyone"</li>
                        <li>Copy the Web App URL</li>
                        <li>Paste it above and connect</li>
                      </ol>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {/* Connection Section */}
                  <div>
                    <h3 className="text-[13px] font-semibold text-ink mb-3 flex items-center gap-2">
                      Connection
                      {connectionStatus === 'connected' && (
                        <span className="flex h-[18px] items-center gap-1 rounded-full bg-[#10B981]/15 px-2 text-[9px] font-bold uppercase tracking-wider text-[#10B981]">
                          <CheckCircle2 size={9} strokeWidth={2.5} />
                        </span>
                      )}
                      {connectionStatus === 'error' && (
                        <span className="flex h-[18px] items-center gap-1 rounded-full bg-red-500/15 px-2 text-[9px] font-bold uppercase tracking-wider text-red-600">
                          <AlertTriangle size={9} strokeWidth={2.5} />
                        </span>
                      )}
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] text-ink-muted w-24">Web App</span>
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-[13px] text-ink font-mono truncate">{truncateUrl(webAppUrl, 50)}</span>
                          <button
                            onClick={() => setEditingWebAppUrl(!editingWebAppUrl)}
                            className="text-[11px] text-brand hover:underline"
                          >
                            {editingWebAppUrl ? "Cancel" : "Edit"}
                          </button>
                        </div>
                      </div>
                      {editingWebAppUrl ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={webAppUrl}
                            onChange={(e) => setWebAppUrl(e.target.value)}
                            className="flex-1 rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand/20"
                          />
                          <button
                            onClick={async () => {
                              const { error } = await supabase
                                .from("google_sheets_credentials")
                                .update({ web_app_url: webAppUrl.trim() })
                                .eq("workspace_id", workspace!.id);
                              if (error) {
                                toast.error("Failed to update URL");
                                return;
                              }
                              setEditingWebAppUrl(false);
                              toast.success("Web App URL updated");
                            }}
                            className="px-3 py-2 rounded-lg bg-brand text-[13px] font-semibold text-white hover:bg-brand/90"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={handleTestConnection}
                            disabled={testingConnection}
                            className="px-3 py-2 rounded-lg border border-base-border bg-base-raised text-[13px] font-medium text-ink hover:bg-base-border transition-colors disabled:opacity-60"
                          >
                            {testingConnection ? <><Loader2 size={12} className="animate-spin" /> Testing...</> : "Test"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mapping Section */}
                  <div>
                    <h3 className="text-[13px] font-semibold text-ink mb-3">Column Mapping</h3>
                    <div className="p-4 rounded-xl bg-base-raised/50 border border-base-border/60">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] text-ink">
                          {mappingStatus.mapped} of {mappingStatus.total} columns mapped
                        </span>
                        {mappingStatus.needsReview > 0 && (
                          <span className="text-[12px] text-amber-600 font-medium">
                            {mappingStatus.needsReview} need review
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-ink-muted">
                        {mappingStatus.needsReview > 0 
                          ? "Some columns need review before import." 
                          : "All required fields are ready."}
                      </p>
                      <button
                        onClick={() => setMappingOpen(true)}
                        className="w-full mt-3 h-[34px] flex items-center justify-center gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
                      >
                        <ChevronRight size={14} />
                        Review mapping
                      </button>
                    </div>
                  </div>

                  {/* Sync Section */}
                  <div>
                    <h3 className="text-[13px] font-semibold text-ink mb-3">Sync</h3>
                    <div className="p-4 rounded-xl bg-base-raised/50 border border-base-border/60">
                      {syncResult ? (
                        <div className="text-[13px] text-ink mb-2">
                          {syncResult.created > 0 && (
                            <span className="text-green-600 font-medium">{syncResult.created} new orders imported</span>
                          )}
                          {syncResult.updated > 0 && syncResult.created === 0 && (
                            <span className="text-blue-600 font-medium">{syncResult.updated} orders updated</span>
                          )}
                          {syncResult.created === 0 && syncResult.updated === 0 && (
                            <span className="text-ink-muted">Everything is up to date</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[12px] text-ink-muted mb-2">
                          Last sync: Just now
                        </div>
                      )}
                      <button
                        onClick={handleSync}
                        disabled={syncing || !webAppUrl}
                        className="w-full h-[34px] flex items-center justify-center gap-2 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors disabled:opacity-60"
                      >
                        Sync now
                      </button>
                    </div>
                  </div>

                  {/* Setup Guide - Collapsible */}
                  <div>
                    <button
                      onClick={() => setSetupGuideOpen(!setupGuideOpen)}
                      className="w-full text-[12px] text-ink-muted hover:text-ink flex items-center justify-between py-2"
                    >
                      <span>Setup guide</span>
                      <ChevronDown size={14} className={setupGuideOpen ? "rotate-180" : ""} />
                    </button>
                    {setupGuideOpen && (
                      <div className="mt-2 p-4 rounded-lg bg-base-raised/50 border border-base-border/60">
                        <ol className="text-[12px] text-ink-muted space-y-2 list-decimal list-inside">
                          <li>Open your Google Sheet</li>
                          <li>Go to Extensions → Apps Script</li>
                          <li>Deploy as Web App (doGet)</li>
                          <li>Set access to "Anyone"</li>
                          <li>Copy the Web App URL</li>
                          <li>Paste it in the connection section</li>
                        </ol>
                      </div>
                    )}
                  </div>

                  {/* Advanced - Collapsible */}
                  <div>
                    <button
                      onClick={() => setAdvancedOpen(!advancedOpen)}
                      className="w-full text-[12px] text-ink-muted hover:text-ink flex items-center justify-between py-2"
                    >
                      <span>Advanced</span>
                      <ChevronDown size={14} className={advancedOpen ? "rotate-180" : ""} />
                    </button>
                    {advancedOpen && (
                      <div className="mt-2 space-y-3">
                        <div className="p-4 rounded-lg bg-base-raised/50 border border-base-border/60">
                          <div className="text-[12px] text-ink-muted mb-2">Connection details</div>
                          <div className="text-[11px] text-ink font-mono truncate">{truncateUrl(webAppUrl, 60)}</div>
                        </div>
                        <button
                          onClick={handleDisconnect}
                          className="w-full h-[34px] rounded-lg border border-red-200 bg-red-50 text-[13px] font-medium text-red-600 hover:bg-red-100 transition-colors"
                        >
                          Disconnect
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-base-border/60 bg-base-raised/20">
              <button onClick={() => setManageOpen(false)} className="w-full rounded-lg py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mapping Modal ── */}
      <GoogleSheetsMappingModal
        workspaceId={workspace?.id || ''}
        webAppUrl={webAppUrl}
        isOpen={mappingOpen}
        onClose={() => setMappingOpen(false)}
        onMappingSaved={loadCredentials}
      />
    </>
  );
}

export default GoogleSheetsIntegrationCard;
