import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { 
  Shield, 
  RefreshCw, 
  Ban,
  AlertTriangle,
  Lock
} from "lucide-react";

interface SecurityLog {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_id: string | null;
  blocked: boolean;
  blocked_until: string | null;
  created_at: string;
}

export default function SecurityCenter() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('security_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching security logs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnblockIP(ip: string) {
    try {
      const { error } = await supabase
        .from('blocked_ips')
        .update({ blocked: false, blocked_until: null })
        .eq('ip_address', ip);

      if (error) throw error;
      await fetchLogs();
    } catch (error) {
      console.error('Error unblocking IP:', error);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Security Center</h1>
        <p className="text-slate-400">Monitor platform security</p>
      </div>

      <div className="mb-6">
        <button
          onClick={fetchLogs}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-white">{logs.length}</div>
          <div className="text-sm text-slate-400">Total Events</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">{logs.filter(l => l.blocked).length}</div>
          <div className="text-sm text-slate-400">Blocked IPs</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-400">{logs.filter(l => l.event_type === 'failed_login').length}</div>
          <div className="text-sm text-slate-400">Failed Logins</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">{logs.filter(l => l.event_type === 'suspicious_activity').length}</div>
          <div className="text-sm text-slate-400">Suspicious Activity</div>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Event Type</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">IP Address</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Blocked</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Timestamp</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-800 hover:bg-slate-800/30">
                <td className="px-4 py-3 text-sm text-white">{log.event_type}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{log.ip_address || '-'}</td>
                <td className="px-4 py-3">
                  {log.blocked ? (
                    <span className="px-2 py-1 rounded-full text-xs font-medium text-red-400 bg-red-500/20">Blocked</span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs font-medium text-emerald-400 bg-emerald-500/20">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {log.blocked && log.ip_address && (
                    <button
                      onClick={() => handleUnblockIP(log.ip_address!)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-white text-sm"
                    >
                      Unblock
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