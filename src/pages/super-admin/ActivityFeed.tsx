import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { 
  Activity, 
  RefreshCw, 
  Filter, 
  Search,
  User,
  Building2,
  ShoppingCart,
  Package,
  Database,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";

interface ActivityLog {
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

export default function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetchActivities();

    // Subscribe to realtime changes
    const subscription = supabase
      .channel('activity_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, (payload) => {
        setActivities(prev => [payload.new as ActivityLog, ...prev].slice(0, 100));
      })
      .subscribe();

    return () => {
      // Synchronous cleanup - ignore the Promise
      void subscription.unsubscribe();
    };
  }, []);

  async function fetchActivities() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredActivities = filter === 'all' 
    ? activities 
    : activities.filter(a => a.action.toLowerCase().includes(filter.toLowerCase()));

  function getActionIcon(action: string) {
    if (action.includes('user')) return User;
    if (action.includes('workspace')) return Building2;
    if (action.includes('order')) return ShoppingCart;
    if (action.includes('product')) return Package;
    if (action.includes('error')) return XCircle;
    if (action.includes('success')) return CheckCircle;
    return Activity;
  }

  function getActionColor(action: string) {
    if (action.includes('delete') || action.includes('error') || action.includes('failed')) return 'text-red-400';
    if (action.includes('create') || action.includes('success')) return 'text-emerald-400';
    if (action.includes('update') || action.includes('edit')) return 'text-blue-400';
    return 'text-slate-400';
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Activity Feed</h1>
        <p className="text-slate-400">Real-time platform activity</p>
      </div>

      <div className="mb-6 flex gap-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-accent"
        >
          <option value="all">All Activities</option>
          <option value="user">User Activities</option>
          <option value="workspace">Workspace Activities</option>
          <option value="order">Order Activities</option>
          <option value="product">Product Activities</option>
        </select>
        <button
          onClick={fetchActivities}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2 transition-colors"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="animate-spin text-brand-accent" size={32} />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            No activities found
          </div>
        ) : (
          <div className="space-y-4">
            {filteredActivities.map((activity) => {
              const Icon = getActionIcon(activity.action);
              return (
                <div key={activity.id} className="flex items-start gap-4 p-4 bg-slate-800/30 rounded-lg">
                  <div className={`p-2 rounded-lg bg-slate-800 ${getActionColor(activity.action)}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-white">{activity.action}</div>
                    <div className="text-sm text-slate-400">
                      {activity.entity_type} {activity.entity_id && `(${activity.entity_id.slice(0, 8)}...)`}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <Clock size={12} />
                      {new Date(activity.created_at).toLocaleString()}
                      {activity.ip_address && ` • ${activity.ip_address}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}