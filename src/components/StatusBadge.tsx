import { memo } from "react";
import {
  getStatusBadgeClasses,
  getStatusLabel,
  getStatusIcon,
  normalizeStatusOrNull,
  type CanonicalStatus,
  type StatusLanguage
} from "../lib/statusEngine";
import { useI18n } from "../i18n";
import { CheckCircle2, Clock, Phone, Calendar, XCircle, Ban, Copy, UserX, Truck, Package, Edit, CreditCard, Navigation, Map, FileCheck, PhoneOff, PhoneMissed, Voicemail, Circle, ArrowLeft } from "lucide-react";

interface StatusBadgeProps {
  status: CanonicalStatus | string;
  language?: StatusLanguage;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const ICONS: Record<string, any> = {
  'clock': Clock,
  'check-circle': CheckCircle2,
  'phone-off': PhoneOff,
  'phone-missed': PhoneMissed,
  'voicemail': Voicemail,
  'phone': Phone,
  'calendar': Calendar,
  'map-pin': Map,
  'x-circle': XCircle,
  'ban': Ban,
  'copy': Copy,
  'user-x': UserX,
  'truck': Truck,
  'package-check': Package,
  'arrow-return': ArrowLeft,
  'x': XCircle,
  'edit': Edit,
  'credit-card': CreditCard,
  'package': Package,
  'file-text': Edit,
  'check': CheckCircle2,
  'navigation': Navigation,
  'map': Map,
  'file-check': FileCheck,
  'circle': Circle,
};

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-[12px]",
  lg: "px-3 py-1.5 text-[13px]",
};

const ICON_SIZES = {
  sm: 11,
  md: 13,
  lg: 15,
};

export const StatusBadge = memo(function StatusBadge({
  status,
  language: propLanguage,
  showIcon = true,
  size = "md",
  className = ""
}: StatusBadgeProps) {
  const { language: workspaceLanguage } = useI18n();

  // If status is null/undefined/empty we must NOT coerce it to a default
  // Display exactly what exists in the database
  if (status === null || status === undefined || String(status).trim() === "") {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-base-border bg-base-surface px-2 py-0.5 text-[11px] text-ink-muted whitespace-nowrap ${className}`}>
        —
      </span>
    );
  }

  const rawStatus = String(status).trim();
  const canonical = normalizeStatusOrNull(rawStatus);
  const language = propLanguage ?? workspaceLanguage;
  const colorClasses = canonical
    ? getStatusBadgeClasses(canonical)
    : "border-gray-500/30 bg-gray-500/10 text-gray-600 dark:text-gray-400";
  const iconName = canonical ? getStatusIcon(canonical) : "circle";
  const label = canonical ? getStatusLabel(canonical, language) : rawStatus;

  const sizeClasses = SIZE_CLASSES[size];
  const IconComponent = ICONS[iconName] || Circle;
  const iconSize = ICON_SIZES[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap ${colorClasses} ${sizeClasses} ${className}`}
    >
      {showIcon && <IconComponent size={iconSize} />}
      {label}
    </span>
  );
});
