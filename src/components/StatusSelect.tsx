import { useI18n } from "../i18n";
import { 
  getSortedStatusOptions, 
  normalizeStatus,
  type CanonicalStatus,
  type StatusLanguage 
} from "../lib/statusEngine";

interface StatusSelectProps {
  value: CanonicalStatus | string;
  onChange: (value: CanonicalStatus) => void;
  language?: StatusLanguage;
  className?: string;
  disabled?: boolean;
  includeAll?: boolean;
  allLabel?: string;
  title?: string;
}

export function StatusSelect({ 
  value, 
  onChange, 
  language: propLanguage,
  className = "",
  disabled = false,
  includeAll = false,
  allLabel = "All statuses",
  title,
}: StatusSelectProps) {
  const { language: workspaceLanguage, t } = useI18n();
  const language: StatusLanguage = propLanguage ?? workspaceLanguage;
  
  // Get sorted status options
  const options = getSortedStatusOptions(language);
  
  // Normalize the current value to ensure it's canonical
  const normalizedValue = normalizeStatus(value);
  
  return (
    <select
      value={normalizedValue}
      onChange={(e) => onChange(e.target.value as CanonicalStatus)}
      disabled={disabled}
      title={title}
      className={`rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50 outline-none disabled:opacity-50 ${className}`}
    >
      {includeAll && <option value="all">{allLabel === "All statuses" ? t("common.all") : allLabel}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
