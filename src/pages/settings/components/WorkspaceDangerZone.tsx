import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, CheckCircle2, Loader2, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";

type ResetResult = {
  success: boolean;
  deleted_total?: number;
  database_verified_empty?: boolean;
  storage_verified?: boolean;
  owner_preserved?: boolean;
  subscription_preserved?: boolean;
  warnings?: string[];
};

const RESET_ITEMS = [
  "Orders, customers, products, inventory, expenses, payouts and shipping history",
  "Integration credentials, tokens, mappings, sync state and webhooks",
  "WhatsApp connection, messages, automation, audio and queue history",
  "Ads, AI generations, notifications, exports, support content and team data",
  "Workspace product images, recordings and audio files",
  "Settings, counters, status mappings and operational preferences",
];

const PRESERVED_ITEMS = [
  "Workspace ID, name and original creation date",
  "Workspace owner account and owner access",
  "Current subscription, plan limits and platform billing records",
  "Platform security and administrative audit records",
];

const CONFETTI = [
  { left: "9%", color: "#e82f69", delay: 0.02, drift: 18 },
  { left: "18%", color: "#8b5cf6", delay: 0.12, drift: -14 },
  { left: "28%", color: "#06b6d4", delay: 0.06, drift: 22 },
  { left: "38%", color: "#f59e0b", delay: 0.18, drift: -18 },
  { left: "48%", color: "#e82f69", delay: 0.1, drift: 15 },
  { left: "58%", color: "#22c55e", delay: 0.03, drift: -20 },
  { left: "68%", color: "#8b5cf6", delay: 0.16, drift: 20 },
  { left: "78%", color: "#06b6d4", delay: 0.08, drift: -16 },
  { left: "89%", color: "#f59e0b", delay: 0.2, drift: 14 },
];

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Workspace reset failed. No database changes were kept if the database step failed.";
}

function SuccessCelebration({ deletedTotal }: { deletedTotal: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative isolate overflow-hidden rounded-2xl border border-success/20 bg-gradient-to-br from-success/10 via-base-surface to-brand-accent/5 px-4 py-6 text-center sm:px-6 sm:py-7">
      {!reduceMotion && CONFETTI.map((particle, index) => (
        <motion.span
          key={`${particle.left}-${particle.color}`}
          aria-hidden="true"
          className="pointer-events-none absolute top-[-14px] h-2.5 w-1.5 rounded-sm"
          style={{ left: particle.left, backgroundColor: particle.color }}
          initial={{ y: -8, x: 0, rotate: 0, opacity: 0 }}
          animate={{ y: 150, x: particle.drift, rotate: index % 2 ? 240 : -240, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.55, delay: particle.delay, ease: "easeOut" }}
        />
      ))}

      <motion.div
        className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-white shadow-[0_12px_35px_rgba(34,197,94,0.3)] sm:h-[72px] sm:w-[72px]"
        initial={reduceMotion ? false : { scale: 0.35, rotate: -18, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 17 }}
      >
        <motion.div
          initial={reduceMotion ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.22, type: "spring", stiffness: 320, damping: 16 }}
        >
          <Check size={34} strokeWidth={3} />
        </motion.div>
        {!reduceMotion && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-success"
            initial={{ scale: 1, opacity: 0.65 }}
            animate={{ scale: 1.75, opacity: 0 }}
            transition={{ duration: 1, delay: 0.25, ease: "easeOut" }}
          />
        )}
      </motion.div>

      <motion.div
        initial={reduceMotion ? false : { y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.18, duration: 0.35 }}
      >
        <div className="mt-4 flex items-center justify-center gap-1.5 text-success">
          <Sparkles size={14} />
          <span className="text-[11px] font-bold uppercase tracking-[0.16em]">Fresh start ready</span>
        </div>
        <h4 className="mt-1.5 text-xl font-bold text-ink sm:text-2xl">Workspace reset complete</h4>
        <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-ink-muted sm:text-[13px]">
          Everything was cleared and verified successfully. {deletedTotal.toLocaleString()} workspace {deletedTotal === 1 ? "record was" : "records were"} removed.
        </p>
      </motion.div>
    </div>
  );
}

export default function WorkspaceDangerZone() {
  const { workspace, profile, refreshProfile } = useAuth();
  const reduceMotion = useReducedMotion();
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetResult | null>(null);

  const canRequestReset = Boolean(profile && ["owner", "founder", "super_admin"].includes(profile.role));
  const expectedConfirmText = useMemo(() => `RESET ${workspace?.name ?? ""}`, [workspace?.name]);

  const close = () => {
    if (isResetting) return;
    setShowModal(false);
    setConfirmText("");
    setError(null);
    setResult(null);
  };

  useEffect(() => {
    if (!showModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isResetting) close();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showModal, isResetting]);

  if (!canRequestReset || !workspace?.id) return null;

  const handleReset = async () => {
    if (confirmText !== expectedConfirmText || !workspace.id) return;

    setIsResetting(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("reset-workspace", {
        body: { workspace_id: workspace.id, confirmation: confirmText },
      });
      if (invokeError) throw invokeError;
      if (!data?.success || !data?.database_verified_empty || !data?.storage_verified) {
        throw new Error("Reset verification did not complete. Run the reset again to finish cleanup.");
      }
      setResult(data as ResetResult);
      await refreshProfile();
    } catch (resetError) {
      console.error("[WorkspaceReset] reset failed", resetError);
      setError(errorMessage(resetError));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <section className="mt-2 rounded-2xl border border-danger/25 bg-danger/5 p-4 sm:p-5" aria-labelledby="workspace-danger-zone-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-danger/10 text-danger">
              <AlertTriangle size={19} />
            </div>
            <div>
              <h2 id="workspace-danger-zone-title" className="text-[14px] font-semibold text-danger">Danger zone</h2>
              <p className="mt-1 max-w-2xl text-[12px] leading-5 text-ink-muted">
                Return this workspace to a clean, first-day state. This permanently removes seller data, disconnects every integration, removes team access except owners, and resets operational settings.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex min-h-11 w-full flex-none items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-[12px] font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-danger/20 active:translate-y-0 sm:w-auto"
          >
            <Trash2 size={14} /> Full workspace reset
          </button>
        </div>
      </section>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showModal && (
          <motion.div
            className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-950/70 p-3 backdrop-blur-sm sm:p-4"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-workspace-title"
            aria-describedby="reset-workspace-description"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !isResetting) close();
            }}
          >
            <motion.div
              className="relative flex max-h-[calc(100dvh-1.5rem)] max-w-[600px] flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-2xl sm:max-h-[min(760px,calc(100dvh-2rem))]"
              style={{ width: "min(600px, calc(100vw - 24px))" }}
              initial={reduceMotion ? false : { y: 42, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { y: 28, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex flex-none items-start justify-between gap-3 border-b border-base-border px-4 py-3.5 sm:px-6 sm:py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${result ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                    {result ? <CheckCircle2 size={21} /> : <AlertTriangle size={21} />}
                  </div>
                  <div className="min-w-0">
                    <h3 id="reset-workspace-title" className="truncate text-[16px] font-semibold text-ink sm:text-[17px]">
                      {result ? "Reset successful" : "Reset the entire workspace?"}
                    </h3>
                    <p className="mt-0.5 truncate text-[11px] text-ink-muted sm:text-[12px]">{workspace.name}</p>
                  </div>
                </div>
                {!isResetting && (
                  <button type="button" onClick={close} className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-ink-muted transition hover:bg-base-raised hover:text-ink" aria-label="Close reset dialog">
                    <X size={18} />
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5" aria-live="polite">
                <AnimatePresence mode="wait">
                  {result ? (
                    <motion.div key="success" className="space-y-4" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
                      <SuccessCelebration deletedTotal={Number(result.deleted_total || 0)} />

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {["Seller data is empty", "Integrations are disconnected", "Workspace files are removed", "Owner and subscription are preserved"].map((item) => (
                          <motion.div
                            key={item}
                            className="flex items-center gap-2.5 rounded-xl border border-success/10 bg-success/5 px-3 py-3 text-[11.5px] font-medium text-ink"
                            initial={reduceMotion ? false : { y: 8, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: reduceMotion ? 0 : 0.28 }}
                          >
                            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-success/15 text-success"><Check size={12} strokeWidth={3} /></span>
                            {item}
                          </motion.div>
                        ))}
                      </div>

                      {result.warnings?.map((warning) => (
                        <p key={warning} className="rounded-xl border border-warning/15 bg-warning/10 px-3 py-2.5 text-[11.5px] leading-5 text-warning">{warning}</p>
                      ))}
                    </motion.div>
                  ) : isResetting ? (
                    <motion.div key="loading" className="flex min-h-[360px] flex-col items-center justify-center px-3 text-center sm:min-h-[420px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <div className="relative flex h-20 w-20 items-center justify-center">
                        <motion.span className="absolute inset-0 rounded-full border-2 border-danger/15" animate={reduceMotion ? undefined : { scale: [1, 1.18, 1], opacity: [0.6, 0.15, 0.6] }} transition={{ duration: 1.8, repeat: Infinity }} />
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger"><Loader2 size={28} className="animate-spin" /></span>
                      </div>
                      <p className="mt-5 text-[15px] font-semibold text-ink">Creating your fresh workspace…</p>
                      <p className="mt-2 max-w-md text-[12px] leading-5 text-ink-muted">Deleting workspace data, disconnecting integrations, cleaning files, and verifying every step.</p>
                      <div className="mt-5 flex items-center gap-2 rounded-full bg-base-raised px-3 py-1.5 text-[10.5px] font-medium text-ink-muted"><ShieldCheck size={13} /> Keep this page open until verification finishes</div>
                    </motion.div>
                  ) : (
                    <motion.div key="confirmation" className="space-y-4 sm:space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <p id="reset-workspace-description" className="text-[12px] leading-5 text-ink-muted sm:text-[13px] sm:leading-6">
                        This action is permanent and cannot be undone. It affects every module in this workspace, including modules added in the future.
                      </p>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-danger/15 bg-danger/5 p-3.5 sm:p-4">
                          <div className="flex items-center gap-2 text-[12px] font-semibold text-danger"><Trash2 size={14} /> Permanently removed</div>
                          <ul className="mt-3 space-y-2 text-[11px] leading-[1.45rem] text-ink-muted sm:text-[11.5px]">
                            {RESET_ITEMS.map((item) => <li key={item} className="flex gap-2"><span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-danger/70" />{item}</li>)}
                          </ul>
                        </div>
                        <div className="rounded-2xl border border-success/15 bg-success/5 p-3.5 sm:p-4">
                          <div className="flex items-center gap-2 text-[12px] font-semibold text-success"><ShieldCheck size={14} /> Kept safe</div>
                          <ul className="mt-3 space-y-2 text-[11px] leading-[1.45rem] text-ink-muted sm:text-[11.5px]">
                            {PRESERVED_ITEMS.map((item) => <li key={item} className="flex gap-2"><Check size={13} className="mt-1 flex-none text-success" />{item}</li>)}
                          </ul>
                        </div>
                      </div>

                      {error && <div className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-[12px] leading-5 text-danger">{error}</div>}

                      <label className="block rounded-2xl border border-base-border bg-base-raised/50 p-3.5 sm:p-4">
                        <span className="text-[11.5px] font-medium leading-5 text-ink sm:text-[12px]">Type the text below to confirm</span>
                        <span className="mt-2 block select-all break-all rounded-lg bg-danger/10 px-2.5 py-2 font-mono text-[11.5px] font-bold text-danger">{expectedConfirmText}</span>
                        <input
                          autoFocus
                          type="text"
                          value={confirmText}
                          onChange={(event) => setConfirmText(event.target.value)}
                          placeholder="Enter confirmation text"
                          autoCapitalize="characters"
                          autoComplete="off"
                          spellCheck={false}
                          className="mt-2.5 min-h-12 w-full rounded-xl border border-base-border bg-base-surface px-3.5 py-3 text-[13px] text-ink outline-none transition focus:border-danger focus:ring-2 focus:ring-danger/15"
                        />
                      </label>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {!isResetting && (
                <div
                  className="flex flex-none flex-col-reverse gap-2 border-t border-base-border bg-base-surface/95 px-4 pb-4 pt-3 backdrop-blur sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-4"
                  style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
                >
                  {result ? (
                    <button type="button" onClick={() => window.location.assign("/")} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-accent px-5 py-3 text-[13px] font-semibold text-white shadow-lg shadow-brand-accent/20 transition hover:-translate-y-0.5 active:translate-y-0 sm:w-auto">
                      <Sparkles size={15} /> Continue to clean workspace
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={close} className="min-h-11 w-full rounded-xl px-4 py-2.5 text-[13px] font-medium text-ink-muted transition hover:bg-base-raised hover:text-ink sm:w-auto">Cancel</button>
                      <button
                        type="button"
                        onClick={() => void handleReset()}
                        disabled={confirmText !== expectedConfirmText}
                        className="min-h-12 w-full rounded-xl bg-danger px-5 py-3 text-[13px] font-semibold text-white shadow-lg shadow-danger/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none active:translate-y-0 sm:w-auto"
                      >
                        Reset workspace permanently
                      </button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
