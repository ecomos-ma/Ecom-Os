import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, MoreHorizontal, RefreshCw, ShieldCheck, Unplug, X } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { toast } from "../../../components/Toast";
import { metaAdsService, type MetaConnectionStatus } from "../../../services/metaAdsService";

function MetaIntegrationCard({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) {
  const [status, setStatus] = useState<MetaConnectionStatus | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const connected = ["connected", "syncing", "sync_failed", "permission_required"].includes(status?.state ?? "");

  const load = useCallback(async () => {
    try { const next = await metaAdsService.status(); setStatus(next); onConnectionChange?.(["connected", "syncing", "sync_failed", "permission_required"].includes(next.state)); }
    catch { setStatus(null); onConnectionChange?.(false); }
  }, [onConnectionChange]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search); const result = params.get("meta"); const message = params.get("meta_message");
    if (result === "connected") { toast.success("Meta Ads connected securely."); setModalOpen(true); }
    else if (result === "error") toast.error(message || "Meta connection failed.");
  }, []);

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true); try { await operation(); toast.success(success); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : "Meta operation failed"); } finally { setBusy(false); }
  };

  return <>
    <div className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] transition-all duration-150 hover:scale-[1.02] hover:shadow-md">
      <div className="absolute right-4 top-4"><button onClick={() => setModalOpen(true)} className="text-ink-faint transition-colors hover:text-ink" aria-label="Configure Meta"><MoreHorizontal size={18} /></button></div>
      <div className="flex flex-col pb-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-base-border/50 bg-base-raised"><img src={getIntegrationLogo("meta") || ""} alt="Meta Ads" className="h-full w-full object-contain" /></div>
        <div className="flex flex-col gap-1.5"><h3 className="text-[16px] font-semibold leading-none tracking-tight text-ink">Meta Ads</h3>
          {connected ? <span className="flex h-[22px] w-fit items-center gap-1 rounded-full bg-[#10B981]/15 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-[#10B981]"><CheckCircle2 size={11} /> {status?.state === "permission_required" ? "Action required" : "Connected"}</span> : <span className="flex h-[22px] w-fit items-center rounded-full bg-base-raised px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">Not connected</span>}
        </div>
        <p className="mt-3 min-h-[40px] flex-1 text-[13px] leading-relaxed text-ink-muted">OAuth-secured campaign management, creative launches, daily reporting, scaling, and automation.</p>
      </div>
      <div className="mt-auto border-t border-base-border/60 pt-4">
        <button onClick={() => connected ? setModalOpen(true) : run(() => metaAdsService.connect(`${window.location.origin}/settings/integrations`), "Redirecting to Meta…")} disabled={busy} className="h-[38px] w-full rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand/90 disabled:opacity-60">
          {busy ? "Working…" : connected ? "Manage connection" : "Connect with Meta"}
        </button>
      </div>
    </div>

    {modalOpen && <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-base-border bg-base-surface shadow-2xl">
        <div className="flex items-center gap-4 border-b border-base-border/60 bg-base-raised/30 px-7 py-6"><div className="h-11 w-11 overflow-hidden rounded-2xl border border-base-border/50"><img src={getIntegrationLogo("meta") || ""} alt="Meta Ads" /></div><div className="flex-1"><h2 className="text-[18px] font-bold text-ink">Meta Ads connection</h2><p className="text-[13px] text-ink-muted">Tokens remain encrypted on the server and are never returned here.</p></div><button onClick={() => setModalOpen(false)} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink"><X size={16} /></button></div>
        <div className="space-y-5 px-7 py-6">
          {!connected ? <div className="rounded-2xl border border-brand/20 bg-brand/5 p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 text-brand" size={20} /><div><div className="font-semibold text-ink">Secure Meta OAuth</div><p className="mt-1 text-[13px] text-ink-muted">Sign in to Meta, approve the requested business and ads permissions, then select your defaults.</p></div></div><button onClick={() => run(() => metaAdsService.connect(`${window.location.origin}/settings/integrations`), "Redirecting to Meta…")} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"><ExternalLink size={14} /> Connect with Meta</button></div> : <>
            <div className="grid gap-3 sm:grid-cols-3"><Info label="Meta user" value={status?.connection?.meta_user_name || status?.connection?.meta_user_id || "Connected"} /><Info label="Health" value={status?.connection?.last_sync_error ? "Needs attention" : "Healthy"} /><Info label="Last sync" value={status?.connection?.last_successful_sync_at ? new Date(status.connection.last_successful_sync_at).toLocaleString() : "Not synced yet"} /></div>
            {status?.connection?.last_sync_error && <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[12.5px] text-amber-500">{status.connection.last_sync_error}</div>}
            <AssetSelect label="Default ad account" value={status?.connection?.default_ad_account_id} assets={status?.ad_accounts ?? []} onChange={(id) => run(() => metaAdsService.setDefault("ad_account", id), "Default ad account updated.")} />
            <AssetSelect label="Default Facebook Page" value={status?.connection?.default_page_id} assets={status?.pages ?? []} onChange={(id) => run(() => metaAdsService.setDefault("page", id), "Default Page updated.")} />
            <AssetSelect label="Default Instagram account" value={status?.connection?.default_instagram_account_id} assets={status?.instagram_accounts ?? []} onChange={(id) => run(() => metaAdsService.setDefault("instagram", id), "Default Instagram account updated.")} optional />
            <AssetSelect label="Default Pixel / dataset" value={status?.connection?.default_pixel_id} assets={status?.pixels ?? []} onChange={(id) => run(() => metaAdsService.setDefault("pixel", id), "Default Pixel updated.")} optional />
            <div className="flex flex-wrap gap-2 border-t border-base-border/60 pt-5"><button onClick={() => run(() => metaAdsService.refreshAssets(), "Meta assets refreshed.")} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[12.5px] font-semibold text-ink"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Refresh assets</button><button onClick={() => run(() => metaAdsService.connect(`${window.location.origin}/settings/integrations`), "Redirecting to Meta…")} disabled={busy} className="rounded-xl border border-base-border px-3 py-2 text-[12.5px] font-semibold text-ink">Reconnect</button><button onClick={() => run(async () => { await metaAdsService.disconnect(); setModalOpen(false); }, "Meta disconnected; historical reporting was preserved.")} disabled={busy} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-[12.5px] font-semibold text-danger"><Unplug size={13} /> Disconnect</button></div>
          </>}
        </div>
      </div>
    </div>}
  </>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-base-border bg-base-raised p-3"><div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div><div className="mt-1 truncate text-[13px] font-semibold text-ink">{value}</div></div>; }

function AssetSelect({ label, value, assets, onChange, optional = false }: { label: string; value?: string | null; assets: Array<{ id: string; name?: string; username?: string; currency?: string; timezone?: string }>; onChange: (id: string) => void; optional?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-ink">{label}</span><select value={value ?? ""} onChange={(event) => event.target.value && onChange(event.target.value)} className="w-full rounded-xl border border-base-border bg-base-raised px-3.5 py-2.5 text-[13px] text-ink outline-none focus:border-brand/50"><option value="">{optional ? "No default" : "Select an asset"}</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name || asset.username || "Unnamed"} · {asset.id}{asset.currency ? ` · ${asset.currency}` : ""}{asset.timezone ? ` · ${asset.timezone}` : ""}</option>)}</select></label>;
}

export default MetaIntegrationCard;
