import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { 
  ScrollText, 
  RefreshCw, 
  Search, 
  Filter,
  User,
  Building2,
  Clock
} from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  workspace_id: string | null;
  old_value: any;
  new_value: any;
  ip_address: string | null;
  created_at: string;
}

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.entity_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Audit Log</h1>
        <p className="text-slate-400">Complete platform activity history</p>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-brand-accent"
            />
          </div>
        </div>
        <button
          onClick={fetchLogs}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2 transition-colors"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Action</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Entity</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">User</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">IP Address</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id} className="border-t border-slate-800 hover:bg-slate-800/30">
                <td className="px-4 py-3 text-sm text-white">{log.action}</td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {log.entity_type} {log.entity_id && `(${log.entity_id.slice(0, 8)}...)`}
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">{log.user_id?.slice(0, 8)}...</td>
                <td className="px-4 py-3 text-sm text-slate-400">{log.ip_address || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {new Date(log.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}