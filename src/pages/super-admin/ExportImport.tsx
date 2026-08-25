import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Download, Upload, RefreshCw, FileArchive, CheckCircle, XCircle } from "lucide-react";

interface Export {
  id: string;
  workspace_id: string;
  export_type: string;
  format: string;
  status: string;
  progress: number;
  created_at: string;
}

export default function ExportImport() {
  const [exports, setExports] = useState<Export[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchExports();
  }, []);

  async function fetchExports() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('workspace_exports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExports(data || []);
    } catch (error) {
      console.error('Error fetching exports:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(workspaceId: string, type: string, format: string) {
    try {
      setExporting(true);
      const { error } = await supabase
        .from('workspace_exports')
        .insert({
          workspace_id: workspaceId,
          export_type: type,
          format,
          status: 'pending',
          progress: 0,
        });

      if (error) throw error;
      await fetchExports();
    } catch (error) {
      console.error('Error creating export:', error);
      alert('Failed to create export');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Export / Import Workspace</h1>
        <p className="text-slate-400">Backup and restore workspaces</p>
      </div>

      <div className="mb-6">
        <button
          onClick={fetchExports}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-white flex items-center gap-2"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Export Workspace</h3>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-2">Workspace ID</label>
            <input
              type="text"
              placeholder="03826be0-e050-42d7-a030-a7d5a8d4f920"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">Type</label>
            <select className="px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white">
              <option value="full">Full Backup</option>
              <option value="orders">Orders Only</option>
              <option value="products">Products Only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">Format</label>
            <select className="px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white">
              <option value="zip">ZIP</option>
              <option value="json">JSON</option>
              <option value="sql">SQL</option>
            </select>
          </div>
          <button
            onClick={() => handleExport('03826be0-e050-42d7-a030-a7d5a8d4f920', 'full', 'zip')}
            disabled={exporting}
            className="px-4 py-2 bg-brand-accent hover:bg-brand-accent/80 rounded text-white flex items-center gap-2 disabled:opacity-50"
          >
            <Download size={18} />
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Import Workspace</h3>
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-2">Select Backup File</label>
            <input
              type="file"
              accept=".zip,.json,.sql"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white"
            />
          </div>
          <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white flex items-center gap-2">
            <Upload size={18} />
            Import
          </button>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Workspace</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Type</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Format</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Progress</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Created</th>
            </tr>
          </thead>
          <tbody>
            {exports.map((exp) => (
              <tr key={exp.id} className="border-t border-slate-800 hover:bg-slate-800/30">
                <td className="px-4 py-3 text-sm text-white">{exp.workspace_id.slice(0, 8)}...</td>
                <td className="px-4 py-3 text-sm text-slate-400 capitalize">{exp.export_type}</td>
                <td className="px-4 py-3 text-sm text-slate-400 uppercase">{exp.format}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    exp.status === 'completed' ? 'text-emerald-400 bg-emerald-500/20' :
                    exp.status === 'pending' ? 'text-amber-400 bg-amber-500/20' :
                    exp.status === 'processing' ? 'text-blue-400 bg-blue-500/20' :
                    'text-red-400 bg-red-500/20'
                  }`}>
                    {exp.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">{exp.progress}%</td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {new Date(exp.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}