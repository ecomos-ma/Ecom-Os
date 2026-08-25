import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { founderAdmin } from "../lib/founderAdmin";

export function AdminPreviewBanner() {
  const { session, previewWorkspace, clearPreviewWorkspace } = useAuth();
  const navigate = useNavigate();

  if (!previewWorkspace) return null;

  return (
    <div className="border-b border-brand-accent/30 bg-brand-accent/10 px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink">
        <div>
          <div className="font-semibold">Support Mode — Managing {previewWorkspace.workspace?.name ?? "Workspace"}</div>
          <div className="text-[11px] text-ink-faint">Founder: {session?.user?.email || "Founder"}</div>
          <div className="text-ink-muted">{previewWorkspace.workspace?.name ?? "Workspace"} · {previewWorkspace.profile?.full_name || previewWorkspace.profile?.email || "User"}</div>
        </div>
        <button
          onClick={async () => {
            const rawSession = window.localStorage.getItem("ecomos-founder-support-session");
            if (rawSession) {
              try {
                const supportSession = JSON.parse(rawSession) as { id?: string };
                if (supportSession.id) await founderAdmin.endSupport(supportSession.id);
              } catch {
                // The local marker is non-authoritative; the server expiry and
                // audit log remain the source of truth if ending it fails.
              } finally {
                window.localStorage.removeItem("ecomos-founder-support-session");
              }
            }
            clearPreviewWorkspace();
            navigate("/admin");
          }}
          className="rounded-lg border border-base-border bg-base-surface px-3 py-1.5 text-[12.5px] text-ink hover:bg-base-raised"
        >
          Return to Admin
        </button>
      </div>
    </div>
  );
}
