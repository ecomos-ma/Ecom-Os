import { useI18n } from "../i18n";
import { getAllShippingStatuses, getShippingStatusLabel, normalizeShippingStatus } from "../lib/shippingStatus";

type ShippingStatusSelectProps = {
  value: string | null | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
};

export function ShippingStatusSelect({ value, onChange, disabled, className = "", title }: ShippingStatusSelectProps) {
  const { language } = useI18n();
  const raw = String(value ?? "").trim();
  const selected = normalizeShippingStatus(raw) ?? raw;
  const statuses = getAllShippingStatuses();

  return <select
    aria-label="Delivery status"
    value={selected}
    onChange={(event) => onChange(event.target.value)}
    disabled={disabled}
    title={title}
    className={`min-h-9 rounded-lg border border-base-border bg-base-surface px-3 py-1.5 text-[12px] font-semibold text-ink outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
  >
    <option value="">Ready to send</option>
    {raw && !normalizeShippingStatus(raw) && <option value={raw}>{raw}</option>}
    {statuses.map((status) => <option key={status} value={status}>{getShippingStatusLabel(status, language)}</option>)}
  </select>;
}
