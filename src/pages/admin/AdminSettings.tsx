import { PageHeader } from "../../components/PageHeader";

export default function AdminSettings() {
  return (
    <div>
      <PageHeader title="Admin Settings" subtitle="Configure supervisor-level platform defaults and policies." />
      <div className="rounded-xl border border-base-border bg-base-surface p-6 text-[13px] text-ink-muted">
        Platform settings are ready for future expansion. The current release focuses on workspace-level access management and CRM preview.
      </div>
    </div>
  );
}
