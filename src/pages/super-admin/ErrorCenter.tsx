import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { 
  AlertTriangle, 
  RefreshCw, 
  Search, 
  Filter,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";

interface ErrorLog {
  id: string;
  error_message: string;
  stack_trace: string | null;
  severity: string;
  user_id: string | null;
  workspace_id: string | null;
  status_code: number | null;
  resolved: boolean;
  created_at: string;
}

export default function ErrorCenter() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [resolvedFilter, setResolvedFilter] = useState<string>("all");

  useEffect(() => {
    fetchErrors();
  }, []);

  async function fetchErrors() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setErrors(data || []);
    } catch (error) {
      console.error('Error fetching error logs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(errorId: string) {
    try {
      const { error } = await supabase
        .from('error_logs')
        .update({ resolved: true })
        .eq('id', errorId);

      if (error) throw error;
      await fetchErrors();
    } catch (error) {
      console.error('Error resolving error:', error);
    }
  }

  const filteredErrors = errors.filter(error => {
    const matchesSeverity = severityFilter === 'all' || error.severity === severityFilter;
    const matchesResolved = resolvedFilter === 'all' || 
      (resolvedFilter === 'resolved' && error.resolved) ||
      (resolvedFilter === 'unresolved' && !error.resolved);
    return matchesSeverity && matchesResolved;
  });

  function getSeverityColor(severity: string) {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-500/20';
      case 'error': return 'text-red-400 bg-red-500/20';
      case 'warning': return 'text-amber-400 bg-amber-500/20';
      case 'info': return 'text-blue-400 bg-blue-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Error Center</h1>
        <p className="text-slate-400">Track and resolve platform errors</p>
      </div>

      <div className="mb-6 flex gap-4">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-4 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-white"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          value={resolvedFilter}
          onChange={(e) => setResolvedFilter(e.target.value)}
          className="px-4 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-white"
        >
          <option value="all">All Status</option>
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
        </select>
        <button
          onClick={fetchErrors}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {filteredErrors.map((error) => (
          <div key={error.id} className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(error.severity)}`}>
                  {error.severity}
                </span>
                {error.resolved && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium text-emerald-400 bg-emerald-500/20">
                    Resolved
                  </span>
                )}
              </div>
              {!error.resolved && (
                <button
                  onClick={() => handleResolve(error.id)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-white text-sm"
                >
                  Resolve
                </button>
              )}
            </div>
            <div className="text-white font-medium mb-2">{error.error_message}</div>
            {error.stack_trace && (
              <details className="text-sm text-slate-400">
                <summary className="cursor-pointer hover:text-white">View Stack Trace</summary>
                <pre className="mt-2 p-2 bg-slate-800 rounded overflow-x-auto">{error.stack_trace}</pre>
              </details>
            )}
            <div className="text-xs text-slate-500 mt-2">
              {new Date(error.created_at).toLocaleString()}
              {error.status_code && ` • Status: ${error.status_code}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}