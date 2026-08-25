import { memo } from "react";
import { useI18n } from "../i18n";
import {
  getShippingStatusLabel,
  getShippingStatusColors,
  getShippingStatusIcon,
  type ShippingLanguage,
  normalizeShippingStatus
} from "../lib/shippingStatus";

interface ShippingStatusBadgeProps {
  status: string | null | undefined;
  language?: ShippingLanguage;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-[12px]",
  lg: "px-3 py-1.5 text-[13px]",
};

const ICON_SIZES = {
  sm: 12,
  md: 16,
  lg: 18,
};

export const ShippingStatusBadge = memo(function ShippingStatusBadge({
  status,
  language: propLanguage,
  showIcon = true,
  size = "md",
  className = ""
}: ShippingStatusBadgeProps) {
  const { language: workspaceLanguage } = useI18n();

  // If status is null/undefined/empty, display placeholder
  if (status === null || status === undefined || String(status).trim() === "") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border font-medium px-2 py-0.5 text-[11px] bg-gray-100 text-gray-500 border-gray-300 whitespace-nowrap ${className}`}
      >
        —
      </span>
    );
  }

  // Normalize the status to handle legacy values
  const normalizedStatus = normalizeShippingStatus(status) || status;

  // Determine language from workspace setting or prop
  const language: ShippingLanguage = propLanguage ?? workspaceLanguage;

  // Get label, colors, and icon using normalized status
  const label = getShippingStatusLabel(normalizedStatus, language);
  const colors = getShippingStatusColors(normalizedStatus);
  const IconComponent = getShippingStatusIcon(normalizedStatus);
  const sizeClasses = SIZE_CLASSES[size];
  const iconSize = ICON_SIZES[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap ${sizeClasses} ${className}`}
      style={{
        backgroundColor: colors.background,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      {showIcon && <IconComponent size={iconSize} strokeWidth={2} />}
      {label}
    </span>
  );
});
