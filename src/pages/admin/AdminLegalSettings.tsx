import { FormEvent, useState, useEffect } from "react";
import { Save, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "../../components/Toast";
import type { Database } from "../../types/supabase";

type LegalSettings = Database['public']['Tables']['platform_legal_settings']['Row'];

export default function AdminLegalSettings() {
  const [settings, setSettings] = useState<LegalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    company_display_name: "",
    company_legal_name: "",
    company_registration: "",
    tax_identifier: "",
    business_address: "",
    jurisdiction: "",
    support_email: "",
    support_whatsapp: "",
    legal_email: "",
    support_hours: "",
    terms_version: "1.0",
    privacy_version: "1.0",
    refund_policy_version: "1.0",
    refund_period_days: 30,
    auto_approve_refunds: false,
    data_deletion_enabled: true,
    deletion_grace_period_days: 7,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("platform_legal_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      
      if (data) {
        setSettings(data);
        setFormData({
          company_display_name: data.company_display_name || "",
          company_legal_name: data.company_legal_name || "",
          company_registration: data.company_registration || "",
          tax_identifier: data.tax_identifier || "",
          business_address: data.business_address || "",
          jurisdiction: data.jurisdiction || "",
          support_email: data.support_email || "",
          support_whatsapp: data.support_whatsapp || "",
          legal_email: data.legal_email || "",
          support_hours: data.support_hours || "",
          terms_version: data.terms_version || "1.0",
          privacy_version: data.privacy_version || "1.0",
          refund_policy_version: data.refund_policy_version || "1.0",
          refund_period_days: data.refund_period_days || 30,
          auto_approve_refunds: data.auto_approve_refunds || false,
          data_deletion_enabled: data.data_deletion_enabled !== false,
          deletion_grace_period_days: data.deletion_grace_period_days || 7,
        });
      }
    } catch (error: any) {
      toast.error("Failed to load legal settings");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        terms_last_updated: formData.terms_version !== settings?.terms_version ? new Date().toISOString() : settings?.terms_last_updated,
        privacy_last_updated: formData.privacy_version !== settings?.privacy_version ? new Date().toISOString() : settings?.privacy_last_updated,
        refund_last_updated: formData.refund_policy_version !== settings?.refund_policy_version ? new Date().toISOString() : settings?.refund_last_updated,
      };

      if (settings?.id) {
        const { error } = await supabase
          .from("platform_legal_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("platform_legal_settings").insert(payload);
        if (error) throw error;
      }

      toast.success("Legal settings saved successfully");
      await loadSettings();
    } catch (error: any) {
      toast.error(error.message || "Failed to save legal settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-brand-accent" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-ink mb-2">Legal Configuration</h2>
        <p className="text-ink-muted">Manage company information, legal documents, and support contacts</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Information */}
        <section className="rounded-xl border border-base-border bg-base-surface p-6">
          <h3 className="mb-4 text-lg font-semibold text-ink">Company Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-ink mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={formData.company_display_name}
                onChange={(e) => setFormData({ ...formData, company_display_name: e.target.value })}
                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                placeholder="e.g., Ecom OS"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-2">
                Legal Company Name
              </label>
              <input
                type="text"
                value={formData.company_legal_name}
                onChange={(e) => setFormData({ ...formData, company_legal_name: e.target.value })}
                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                placeholder="Legal entity name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  Registration Number
                </label>
                <input
                  type="text"
                  value={formData.company_registration}
                  onChange={(e) => setFormData({ ...formData, company_registration: e.target.value })}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                  placeholder="Company registration"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  Tax Identifier
                </label>
                <input
                  type="text"
                  value={formData.tax_identifier}
                  onChange={(e) => setFormData({ ...formData, tax_identifier: e.target.value })}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                  placeholder="VAT/Tax ID"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-2">
                Business Address
              </label>
              <textarea
                value={formData.business_address}
                onChange={(e) => setFormData({ ...formData, business_address: e.target.value })}
                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                placeholder="Physical business address"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-2">
                Jurisdiction
              </label>
              <input
                type="text"
                value={formData.jurisdiction}
                onChange={(e) => setFormData({ ...formData, jurisdiction: e.target.value })}
                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                placeholder="e.g., Morocco"
              />
            </div>
          </div>
        </section>

        {/* Support Configuration */}
        <section className="rounded-xl border border-base-border bg-base-surface p-6">
          <h3 className="mb-4 text-lg font-semibold text-ink">Support Configuration</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  Support Email
                </label>
                <input
                  type="email"
                  value={formData.support_email}
                  onChange={(e) => setFormData({ ...formData, support_email: e.target.value })}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                  placeholder="support@ecomos.app"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  Legal Email
                </label>
                <input
                  type="email"
                  value={formData.legal_email}
                  onChange={(e) => setFormData({ ...formData, legal_email: e.target.value })}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                  placeholder="legal@ecomos.app"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-2">
                WhatsApp Support
              </label>
              <input
                type="text"
                value={formData.support_whatsapp}
                onChange={(e) => setFormData({ ...formData, support_whatsapp: e.target.value })}
                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                placeholder="+212 XXX XXX XXX"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-2">
                Support Hours
              </label>
              <input
                type="text"
                value={formData.support_hours}
                onChange={(e) => setFormData({ ...formData, support_hours: e.target.value })}
                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                placeholder="e.g., Monday-Friday 9AM-6PM GMT"
              />
            </div>
          </div>
        </section>

        {/* Document Versions */}
        <section className="rounded-xl border border-base-border bg-base-surface p-6">
          <h3 className="mb-4 text-lg font-semibold text-ink">Legal Document Versions</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  Terms Version
                </label>
                <input
                  type="text"
                  value={formData.terms_version}
                  onChange={(e) => setFormData({ ...formData, terms_version: e.target.value })}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                  placeholder="1.0"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  Privacy Version
                </label>
                <input
                  type="text"
                  value={formData.privacy_version}
                  onChange={(e) => setFormData({ ...formData, privacy_version: e.target.value })}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                  placeholder="1.0"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  Refund Policy Version
                </label>
                <input
                  type="text"
                  value={formData.refund_policy_version}
                  onChange={(e) => setFormData({ ...formData, refund_policy_version: e.target.value })}
                  className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
                  placeholder="1.0"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Refund Configuration */}
        <section className="rounded-xl border border-base-border bg-base-surface p-6">
          <h3 className="mb-4 text-lg font-semibold text-ink">Refund Policy</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-ink mb-2">
                Refund Period (days)
              </label>
              <input
                type="number"
                min="0"
                value={formData.refund_period_days}
                onChange={(e) => setFormData({ ...formData, refund_period_days: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none"
              />
            </div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formData.auto_approve_refunds}
                onChange={(e) => setFormData({ ...formData, auto_approve_refunds: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm font-medium text-ink">Auto-approve eligible refunds</span>
            </label>
          </div>
        </section>

        {/* Data Deletion Configuration */}
        <section className="rounded-xl border border-base-border bg-base-surface p-6">
          <h3 className="mb-4 text-lg font-semibold text-ink">Data Deletion Policy</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formData.data_deletion_enabled}
                onChange={(e) => setFormData({ ...formData, data_deletion_enabled: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm font-medium text-ink">Enable data deletion requests</span>
            </label>
            <div>
              <label className="block text-sm font-semibold text-ink mb-2">
                Deletion Grace Period (days)
              </label>
              <input
                type="number"
                min="0"
                disabled={!formData.data_deletion_enabled}
                value={formData.deletion_grace_period_days}
                onChange={(e) => setFormData({ ...formData, deletion_grace_period_days: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none disabled:opacity-50"
              />
              <p className="mt-2 text-xs text-ink-muted">
                Number of days before deletion requests are actually processed
              </p>
            </div>
          </div>
        </section>

        {/* Info Notice */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-200/50 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-950/30">
          <AlertTriangle size={16} className="mt-0.5 flex-none text-amber-600 dark:text-amber-400" />
          <p className="text-xs leading-6 text-amber-900 dark:text-amber-200">
            Changes to legal document versions will automatically update the last-updated timestamp. Users may be required to re-accept policies if versions change significantly.
          </p>
        </div>

        {/* Submit Button */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}
