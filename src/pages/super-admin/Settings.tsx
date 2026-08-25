import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { 
  Settings, 
  RefreshCw, 
  Save,
  Building2,
  Shield,
  Database,
  Bell
} from "lucide-react";

export default function SuperAdminSettings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*');

      if (error) throw error;
      
      const settingsMap: Record<string, any> = {};
      (data || []).forEach(s => {
        settingsMap[s.setting_key] = s.value;
      });
      
      setSettings(settingsMap);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(settingKey: string, value: any) {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('platform_settings')
        .upsert({ setting_key: settingKey, value });

      if (error) throw error;
      
      setSettings(prev => ({ ...prev, [settingKey]: value }));
    } catch (error) {
      console.error('Error saving setting:', error);
      alert('Failed to save setting');
    } finally {
      setSaving(false);
    }
  }

  const settingGroups = [
    {
      category: 'general',
      icon: Building2,
      title: 'General',
      settings: [
        { key: 'platform_name', label: 'Platform Name', type: 'text' },
        { key: 'maintenance_mode', label: 'Maintenance Mode', type: 'boolean' },
        { key: 'registration_enabled', label: 'Allow Registration', type: 'boolean' },
      ]
    },
    {
      category: 'limits',
      icon: Shield,
      title: 'Limits',
      settings: [
        { key: 'max_workspaces_per_user', label: 'Max Workspaces per User', type: 'number' },
        { key: 'max_storage_per_workspace_mb', label: 'Max Storage per Workspace (MB)', type: 'number' },
      ]
    },
  ];

  return (
    <div className="p-6">
      <AdminPageHeader
        title="Platform Settings"
        description="Configure platform-wide settings"
        actions={
          <button
            onClick={fetchSettings}
            disabled={saving}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        }
      />

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-slate-900/50 border border-slate-800 rounded-xl p-6 h-64"></div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {settingGroups.map((group) => (
            <div key={group.category} className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <group.icon size={20} className="text-brand-accent" />
                {group.title}
              </h3>
              <div className="space-y-4">
                {group.settings.map((setting) => (
                  <div key={setting.key} className="flex items-center justify-between">
                    <div>
                      <div className="text-white">{setting.label}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {setting.type === 'boolean' ? (
                        <button
                          onClick={() => handleSave(setting.key, !settings[setting.key])}
                          disabled={saving}
                          className={`w-12 h-6 rounded-full transition-colors ${
                            settings[setting.key] ? 'bg-brand-accent' : 'bg-slate-700'
                          } disabled:opacity-50`}
                        >
                          <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                            settings[setting.key] ? 'translate-x-6' : 'translate-x-0.5'
                          }`} />
                        </button>
                      ) : setting.type === 'number' ? (
                        <input
                          type="number"
                          value={settings[setting.key] || ''}
                          onChange={(e) => handleSave(setting.key, parseInt(e.target.value))}
                          disabled={saving}
                          className="w-24 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-brand-accent disabled:opacity-50"
                        />
                      ) : (
                        <input
                          type="text"
                          value={settings[setting.key] || ''}
                          onChange={(e) => handleSave(setting.key, e.target.value)}
                          disabled={saving}
                          className="w-48 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-brand-accent disabled:opacity-50"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}