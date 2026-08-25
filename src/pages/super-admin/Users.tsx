import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router-dom";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard } from "../../components/admin/AdminStatCard";
import { AdminDropdown } from "../../components/admin/AdminDropdown";
import { 
  Users, 
  Search, 
  Shield, 
  Ban, 
  LogOut, 
  Trash2,
  RefreshCw,
  Activity,
  Clock,
  Edit,
  Eye,
  ExternalLink,
  MoreVertical
} from "lucide-react";

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  workspace_id: string | null;
  last_active: string | null;
  login_count: number;
  created_at: string;
}

export default function SuperAdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  const [impersonatingUser, setImpersonatingUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();

    const subscription = supabase
      .channel('users-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      // Synchronous cleanup - ignore the Promise
      void subscription.unsubscribe();
    };
  }, []);

  async function fetchUsers() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  });

  async function handleSuspendUser(userId: string) {
    if (!confirm('Are you sure you want to suspend this user?')) return;
    
    try {
      const { data: user } = await supabase.from('profiles').select('*').eq('id', userId).single();
      
      const { error } = await supabase
        .from('profiles')
        .update({ 
          status: 'suspended',
          suspended_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          suspension_reason: 'Suspended by Super Admin'
        })
        .eq('id', userId);

      if (error) throw error;
      
      await supabase.from('activity_logs').insert({
        action: 'User Suspended',
        entity_type: 'user',
        entity_id: userId,
        user_id: userId,
        old_value: { status: user?.status },
        new_value: { status: 'suspended' },
      });
      
      await fetchUsers();
    } catch (error) {
      console.error('Error suspending user:', error);
      alert('Failed to suspend user');
    }
  }

  async function handleUnsuspendUser(userId: string) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          status: 'active',
          suspended_until: null,
          suspension_reason: null
        })
        .eq('id', userId);

      if (error) throw error;
      await fetchUsers();
    } catch (error) {
      console.error('Error unsuspending user:', error);
      alert('Failed to unsuspend user');
    }
  }

  async function handleForceLogout(userId: string) {
    if (!confirm('Force logout this user?')) return;
    
    try {
      // This would require implementing session management
      alert('Session management not yet implemented');
    } catch (error) {
      console.error('Error forcing logout:', error);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    
    try {
      const { data: user } = await supabase.from('profiles').select('*').eq('id', userId).single();
      
      const { error } = await supabase
        .from('profiles')
        .update({ 
          deleted_at: new Date().toISOString(),
          status: 'deleted'
        })
        .eq('id', userId);

      if (error) throw error;
      
      await supabase.from('activity_logs').insert({
        action: 'User Deleted',
        entity_type: 'user',
        entity_id: userId,
        new_value: { status: 'deleted' },
      });
      
      await fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  }

  async function handleEditUser() {
    if (!editingUser.id) return;
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editingUser.full_name,
          email: editingUser.email,
          role: editingUser.role,
          status: editingUser.status,
        })
        .eq('id', editingUser.id);

      if (error) throw error;
      
      await supabase.from('activity_logs').insert({
        action: 'User Updated',
        entity_type: 'user',
        entity_id: editingUser.id,
        new_value: { 
          role: editingUser.role, 
          status: editingUser.status 
        },
      });
      
      setShowEditModal(false);
      setEditingUser({});
      await fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user');
    }
  }

  function openEditModal(user: User) {
    setEditingUser(user);
    setShowEditModal(true);
  }

  async function handleImpersonateUser(user: User) {
    try {
      setImpersonatingUser(user);
      navigate(`/dashboard?impersonate=${user.id}`);
    } catch (error) {
      console.error('Error impersonating user:', error);
      alert('Failed to impersonate user');
    }
  }

  function exitImpersonation() {
    setImpersonatingUser(null);
    navigate('/super-admin/users');
  }

  return (
    <div className="p-6">
      {impersonatingUser && (
        <div className="mb-6 bg-brand-accent/20 border border-brand-accent/50 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye size={20} className="text-brand-accent" />
            <div>
              <div className="text-sm font-medium text-white">Viewing as {impersonatingUser.full_name || impersonatingUser.email}</div>
              <div className="text-xs text-slate-400">Read-only mode</div>
            </div>
          </div>
          <button
            onClick={exitImpersonation}
            className="px-4 py-2 bg-brand-accent hover:bg-brand-accent/80 rounded-lg text-white text-sm flex items-center gap-2 transition-colors"
          >
            <ExternalLink size={16} />
            Exit Viewing Mode
          </button>
        </div>
      )}

      <AdminPageHeader
        title="User Management"
        description="Manage all platform users"
        actions={
          <button
            onClick={fetchUsers}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <AdminStatCard
          title="Total Users"
          value={users.length}
          icon={Users}
          color="brand"
          loading={loading}
        />
        <AdminStatCard
          title="Active"
          value={users.filter(u => u.status === 'active').length}
          icon={Activity}
          color="green"
          loading={loading}
        />
        <AdminStatCard
          title="Suspended"
          value={users.filter(u => u.status === 'suspended').length}
          icon={Ban}
          color="amber"
          loading={loading}
        />
        <AdminStatCard
          title="Deleted"
          value={users.filter(u => u.status === 'deleted').length}
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
              placeholder="Search users..."
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
          <option value="disabled">Disabled</option>
          <option value="pending">Pending</option>
          <option value="deleted">Deleted</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2.5 bg-slate-900/50 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-accent transition-colors"
        >
          <option value="all">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="owner">Owner</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
          <option value="agent">Agent</option>
          <option value="viewer">Viewer</option>
          <option value="support">Support</option>
          <option value="developer">Developer</option>
        </select>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">User</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Role</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Workspace</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Status</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Last Active</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Login Count</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-300">Created</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="px-6 py-4"><div className="animate-pulse h-10 w-10 bg-slate-800 rounded-full"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-20 bg-slate-800 rounded"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-24 bg-slate-800 rounded"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-16 bg-slate-800 rounded"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-24 bg-slate-800 rounded"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-12 bg-slate-800 rounded"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-24 bg-slate-800 rounded"></div></td>
                  <td className="px-6 py-4"><div className="animate-pulse h-4 w-8 bg-slate-800 rounded"></div></td>
                </tr>
              ))
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                  No users found
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-accent to-purple-500 flex items-center justify-center text-white font-semibold">
                        {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-white">{user.full_name || user.email?.split('@')[0] || 'Unknown'}</div>
                        <div className="text-sm text-slate-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full text-xs font-medium capitalize bg-slate-700 text-slate-300">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {user.workspace_id ? user.workspace_id.slice(0, 8) + '...' : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                      user.status === 'suspended' ? 'bg-amber-500/20 text-amber-400' :
                      user.status === 'deleted' ? 'bg-red-500/20 text-red-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {user.last_active ? new Date(user.last_active).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">{user.login_count || 0}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <AdminDropdown
                      trigger={
                        <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                          <MoreVertical size={18} className="text-slate-400" />
                        </button>
                      }
                    >
                      <button
                        onClick={() => openEditModal(user)}
                        className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <Edit size={16} />
                        Edit User
                      </button>
                      <button
                        onClick={() => handleImpersonateUser(user)}
                        className="w-full px-4 py-3 text-left text-sm text-brand-accent hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <Eye size={16} />
                        Open Dashboard
                      </button>
                      {user.status === 'suspended' ? (
                        <button
                          onClick={() => handleUnsuspendUser(user.id)}
                          className="w-full px-4 py-3 text-left text-sm text-emerald-400 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                        >
                          <Shield size={16} />
                          Unsuspend User
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSuspendUser(user.id)}
                          className="w-full px-4 py-3 text-left text-sm text-amber-400 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                        >
                          <Ban size={16} />
                          Suspend User
                        </button>
                      )}
                      <button
                        onClick={() => handleForceLogout(user.id)}
                        className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <LogOut size={16} />
                        Force Logout
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2 transition-colors"
                      >
                        <Trash2 size={16} />
                        Delete User
                      </button>
                    </AdminDropdown>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Edit User</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser({});
                }}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <span className="text-slate-400">×</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Full Name</label>
                <input
                  type="text"
                  value={editingUser.full_name || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-brand-accent"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">Email</label>
                <input
                  type="email"
                  value={editingUser.email || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-brand-accent"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">Role</label>
                <select
                  value={editingUser.role || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-brand-accent"
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="owner">Owner</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="agent">Agent</option>
                  <option value="viewer">Viewer</option>
                  <option value="support">Support</option>
                  <option value="developer">Developer</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">Status</label>
                <select
                  value={editingUser.status || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-brand-accent"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="disabled">Disabled</option>
                  <option value="pending">Pending</option>
                  <option value="deleted">Deleted</option>
                </select>
              </div>
              
              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleEditUser}
                  className="flex-1 px-4 py-2.5 bg-brand-accent hover:bg-brand-accent/80 rounded-lg text-white transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingUser({});
                  }}
                  className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}