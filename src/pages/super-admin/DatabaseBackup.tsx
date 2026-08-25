import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Database, RefreshCw, Download, Play } from "lucide-react";

interface Backup {
  id: string;
  name: string;
  type: string;
  size_bytes: number;
  status: string;
  created_at: string;
}

export default function DatabaseBackup() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchBackups();
  }, []);

  async function fetchBackups() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('database_backups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBackups(data || []);
    } catch (error) {
      console.error('Error fetching backups:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createBackup() {
    try {
      setCreating(true);
      const { error } = await supabase
        .from('database_backups')
        .insert({
          name: `Manual Backup ${new Date().toISOString()}`,
          type: 'manual',
          status: 'pending',
        });

      if (error) throw error;
      await fetchBackups();
    } catch (error) {
      console.error('Error creating backup:', error);
      alert('Failed to create backup');
    } finally {
      setCreating(false);
    }
  }

  function formatBytes(bytes: number) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Database Backups</h1>
        <p className="text-slate-400">Manage database backups</p>
      </div>

      <div className="mb-6 flex gap-4">
        <button
          onClick={createBackup}
          disabled={creating}
          className="px-4 py-2 bg-brand-accent hover:bg-brand-accent/80 rounded text-white flex items-center gap-2 disabled:opacity-50"
        >
          <Play size={18} />
          {creating ? 'Creating...' : 'Create Backup'}
        </button>
        <button
          onClick={fetchBackups}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-white flex items-center gap-2"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Name</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Type</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Size</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Created</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.id} className="border-t border-slate-800 hover:bg-slate-800/30">
                <td className="px-4 py-3 text-sm text-white">{backup.name}</td>
                <td className="px-4 py-3 text-sm text-slate-400 capitalize">{backup.type}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{formatBytes(backup.size_bytes || 0)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    backup.status === 'completed' ? 'text-emerald-400 bg-emerald-500/20' :
                    backup.status === 'pending' ? 'text-amber-400 bg-amber-500/20' :
                    'text-red-400 bg-red-500/20'
                  }`}>
                    {backup.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {new Date(backup.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {backup.status === 'completed' && (
                    <button className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm flex items-center gap-1">
                      <Download size={14} />
                      Download
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}