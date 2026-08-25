import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { Truck } from "lucide-react";

export function ShippingModuleDisabled() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-base-border bg-base-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-base-raised">
          <Truck size={32} className="text-ink-faint" />
        </div>
        <h1 className="text-[22px] font-semibold text-ink mb-3">
          {t("settings.workspace.shippingModule")}
        </h1>
        <p className="text-[14px] text-ink-muted mb-6">
          {t("settings.workspace.shippingDisabledMessage")}
        </p>
        <button
          onClick={() => navigate("/settings")}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent px-6 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-brand-accentHover"
        >
          {t("navigation.settings")}
        </button>
      </div>
    </div>
  );
}