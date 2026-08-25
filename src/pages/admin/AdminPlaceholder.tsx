import { PageHeader } from "../../components/PageHeader";

export default function AdminPlaceholder({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle="This section is ready for the next layer of enterprise administration controls." />
      <div className="rounded-xl border border-base-border bg-base-surface p-6 text-[13px] text-ink-muted">
        The existing admin platform shell is in place. Additional modules can be added here without changing the CRM experience.
      </div>
    </div>
  );
}
