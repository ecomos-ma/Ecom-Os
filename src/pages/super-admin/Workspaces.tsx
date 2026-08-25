import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard } from "../../components/admin/AdminStatCard";
import { AdminDropdown } from "../../components/admin/AdminDropdown";
import { fetchWorkspaceSubscriptions } from "../../lib/admin";
import { toast } from "../../components/Toast";
import { 
  Building2, 
  Search, 
  MoreVertical, 
  Shield, 
  Ban, 
  Archive,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  Users,
  HardDrive,
  Activity,
  Calendar,
  Edit,
  ExternalLink,
  Clock,
  Check
} from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  status: string;
  storage_used_bytes: number;
  created_at: string;
  deleted_at: string | null;
  suspended_until: string | null;
  suspension_reason: string | null;
  subscription_status?: string;
}

export default function SuperAdminWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchWorkspaces();
    fetchSubscriptions();
    
    const channel = supabase
      .channel('workspaces-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspaces' }, () => {
        fetchWorkspaces();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchSubscriptions() {
    try {
      const subsData = await fetchWorkspaceSubscriptions();
      setSubscriptions(subsData || []);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    }
  }

  async function fetchWorkspaces() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Merge with subscription status
      const workspacesWithSubs = (data || []).map(workspace => {
        const sub = subscriptions.find(s => s.workspace_id === workspace.id);
        return {
          ...workspace,
          subscription_status: sub?.status || 'unknown'
        };
      });
      
      setWorkspaces(workspacesWithSubs);
    } catch (error) {
      console.error('Error fetching workspaces:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredWorkspaces = workspaces.filter(workspace => {
    const matchesSearch = workspace.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || workspace.status === statusFilter;
    const matchesSubscription = statusFilter === 'pending_activation' && workspace.subscription_status === 'pending_activation';
    return matchesSearch && (matchesStatus || matchesSubscription);
  });

  async function handleSuspendWorkspace(workspaceId: string) {
    if (!confirm('Are you sure you want to suspend this workspace?')) return;
    
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ 
          status: 'suspended',
          suspended_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          suspension_reason: 'Suspended by Super Admin'
        })
        .eq('id', workspaceId);

      if (error) throw error;
      await fetchWorkspaces();
    } catch (error) {
      console.error('Error suspending workspace:', error);
      alert('Failed to suspend workspace');
    }
  }

  async function handleUnsuspendWorkspace(workspaceId: string) {
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ 
          status: 'active',
          suspended_until: null,
          suspension_reason: null
        })
        .eq('id', workspaceId);

      if (error) throw error;
      await fetchWorkspaces();
    } catch (error) {
      console.error('Error unsuspending workspace:', error);
      alert('Failed to unsuspend workspace');
    }
  }

  async function handleArchiveWorkspace(workspaceId: string) {
    if (!confirm('Are you sure you want to archive this workspace?')) return;
    
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ status: 'archived' })
        .eq('id', workspaceId);

      if (error) throw error;
      await fetchWorkspaces();
    } catch (error) {
      console.error('Error archiving workspace:', error);
      alert('Failed to archive workspace');
    }
  }

  async function handleDeleteWorkspace(workspaceId: string) {
    if (!confirm('Are you sure you want to delete this workspace? This action cannot be undone.')) return;
    
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ 
          deleted_at: new Date().toISOString(),
          status: 'deleted'
        })
        .eq('id', workspaceId);

      if (error) throw error;
      await fetchWorkspaces();
    } catch (error) {
      console.error('Error deleting workspace:', error);
      alert('Failed to delete workspace');
    }
  }

  async function handleAcceptActivation(workspaceId: string) {
    try {
      const { error } = await supabase
        .from("workspace_subscriptions")
        .update({ status: 'active' })
        .eq("workspace_id", workspaceId);
      
      if (error) throw error;
      
      toast.success("Workspace activated successfully.");
      await fetchSubscriptions();
      await fetchWorkspaces();
    } catch (error) {
      console.error(error);
      toast.error("Unable to activate workspace.");
    }
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  return (
    <div className="p-6">
      <AdminPageHeader
        title="Workspace Management"
        description="Manage all platform workspaces"
        actions={
          <button
            onClick={fetchWorkspaces}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <AdminStatCard
          title="Total Workspaces"
          value={workspaces.length}
          icon={Building2}
          color="brand"
          loading={loading}
        />
        <AdminStatCard
          title="Active"
          value={workspaces.filter(w => w.status === 'active').length}
          icon={Activity}
          color="green"
          loading={loading}
        />
        <AdminStatCard
          title="Pending Activation"
          value={workspaces.filter(w => w.subscription_status === 'pending_activation').length}
          icon={Clock}
          color="amber"
          loading={loading}
        />
        <AdminStatCard
          title="Suspended"
          value={workspaces.filter(w => w.status === 'suspended').length}
          icon={Ban}
          color="red"
          loading={loading}
        />
        <AdminStatCard
          title="Deleted"
          value={workspaces.filter(w => w.status === 'deleted').length}
          icon={Trash2}
          color="red"
          loading={loading}
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-800 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-brand-accent transition-colors"
            />
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 bg-slate-900/50 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-accent transition-colors"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
          <option value="deleted">Deleted</option>
          <option value="pending_activation">Pending Activation</option>
        </select>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Workspace</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Status</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Subscription</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Storage Used</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Created</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="px-6 py-4"><div className="animate-pulse h-10 w-10 bg-slate-800 rounded-lg"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-16 bg-slate-800 rounded"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-20 bg-slate-800 rounded"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-20 bg-slate-800 rounded"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-24 bg-slate-800 rounded"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-8 bg-slate-800 rounded"></div></td>
                </tr>
              ))
            ) : filteredWorkspaces.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                  {statusFilter === 'pending_activation' ? 'No pending activation requests' : 'No workspaces found'}
                </td>
              </tr>
            ) : (
              filteredWorkspaces.map((workspace) => (
                <tr key={workspace.id} className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-brand-accent to-purple-500 flex items-center justify-center">
                        <Building2 size={20} className="text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-white">{workspace.name}</div>
                        <div className="text-sm text-slate-400">ID: {workspace.id.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        workspace.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                        workspace.status === 'suspended' ? 'bg-amber-500/20 text-amber-400' :
                        workspace.status === 'archived' ? 'bg-blue-500/20 text-blue-400' :
                        workspace.status === 'deleted' ? 'bg-red-500/20 text-red-400' :
                        'bg-slate-500/20 text-slate-400'
                      }`}>
                        {workspace.status}
                      </span>
                      {workspace.subscription_status === 'pending_activation' && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 flex items-center gap-1">
                          <Clock size={10} />
                          Pending Activation
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      workspace.subscription_status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                      workspace.subscription_status === 'pending_activation' ? 'bg-amber-500/20 text-amber-400' :
                      workspace.subscription_status === 'trial' ? 'bg-purple-500/20 text-purple-400' :
                      workspace.subscription_status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                      workspace.subscription_status === 'expired' ? 'bg-gray-500/20 text-gray-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {workspace.subscription_status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {formatBytes(workspace.storage_used_bytes || 0)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {new Date(workspace.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <AdminDropdown
                      trigger={
                        <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                          <MoreVertical size={18} className="text-slate-400" />
                        </button>
                      }
                    >
                      {workspace.subscription_status === 'pending_activation' && (
                        <button
                          onClick={() => handleAcceptActivation(workspace.id)}
                          className="w-full px-4 py-3 text-left text-sm text-emerald-400 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                        >
                          <Check size={16} />
                          Accept Activation
                        </button>
                      )}
                      {workspace.status === 'suspended' ? (
                        <button
                          onClick={() => handleUnsuspendWorkspace(workspace.id)}
                          className="w-full px-4 py-3 text-left text-sm text-emerald-400 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                        >
                          <Shield size={16} />
                          Unsuspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSuspendWorkspace(workspace.id)}
                          className="w-full px-4 py-3 text-left text-sm text-amber-400 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                        >
                          <Ban size={16} />
                          Suspend
                        </button>
                      )}
                      <button
                        onClick={() => handleArchiveWorkspace(workspace.id)}
                        className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <Archive size={16} />
                        Archive
                      </button>
                      <button
                        onClick={() => handleDeleteWorkspace(workspace.id)}
                        className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </AdminDropdown>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}