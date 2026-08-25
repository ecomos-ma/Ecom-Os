import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useImpersonation } from "../contexts/ImpersonationContext";
import { supabase, SUPABASE_URL } from "../lib/supabase";
import { PlatformLoading } from "../components/PlatformLoading";
import { ArrowUpDown, Building2, Calendar, ShoppingCart, DollarSign, Activity, CheckCircle, XCircle, LogIn, Trash2, Pause } from "lucide-react";

interface WorkspaceData {
  workspace_id: string;
  workspace_name: string;
  created_at: string;
  total_orders: number;
  total_revenue: number;
  active_integrations: Record<string, boolean>;
  last_activity: string;
}

type SortField = 'workspace_name' | 'created_at' | 'total_orders' | 'total_revenue' | 'last_activity';
type SortDirection = 'asc' | 'desc';

/**
 * Hidden founder-only internal access page.
 * Accessible ONLY to ziadennachat5@gmail.com via server-side verification.
 * Route: /internal-founder-access
 * 
 * This page is intentionally not listed in any navigation component.
 * All data access is protected by RLS policies and edge functions.
 */
export default function FounderInternal() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { startImpersonation } = useImpersonation();
  const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    if (!loading) {
      // Client-side check as first line of defense
      // Server-side verification happens via RLS/edge functions
      const isAuthorized = session?.user?.email?.toLowerCase() === "ziadennachat5@gmail.com";
      
      if (!isAuthorized) {
        // Silent redirect to dashboard - no error message to avoid revealing page existence
        navigate("/dashboard", { replace: true });
      }
    }
  }, [session, loading, navigate]);

  useEffect(() => {
    if (session?.user?.email?.toLowerCase() === "ziadennachat5@gmail.com") {
      fetchWorkspaceData();
    }
  }, [session]);

  const fetchWorkspaceData = async () => {
    try {
      setDataLoading(true);
      console.log('[FounderInternal] Fetching workspace data via edge function...');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('[FounderInternal] No session found');
        setWorkspaces([]);
        return;
      }

      console.log('[FounderInternal] Session email:', session.user.email);
      console.log('[FounderInternal] Supabase URL:', SUPABASE_URL);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/founder-internal-access?operation=workspace-overview`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );

      console.log('[FounderInternal] Response status:', response.status);
      console.log('[FounderInternal] Response ok:', response.ok);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[FounderInternal] Edge function error:', errorData);
        console.error('[FounderInternal] Error details:', JSON.stringify(errorData, null, 2));
        setWorkspaces([]);
        return;
      }

      const data = await response.json();
      console.log('[FounderInternal] Response data type:', typeof data);
      console.log('[FounderInternal] Response data:', data);
      console.log('[FounderInternal] Data length:', Array.isArray(data) ? data.length : 'not an array');
      console.log('[FounderInternal] Successfully fetched workspace data:', data?.length, 'workspaces');
      setWorkspaces(data || []);
    } catch (error) {
      console.error('[FounderInternal] Exception fetching workspace data:', error);
      console.error('[FounderInternal] Error stack:', error instanceof Error ? error.stack : 'no stack');
      setWorkspaces([]);
    } finally {
      setDataLoading(false);
    }
  };

  const sortedWorkspaces = useMemo(() => {
    return [...workspaces].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'workspace_name':
          comparison = a.workspace_name.localeCompare(b.workspace_name);
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'total_orders':
          comparison = a.total_orders - b.total_orders;
          break;
        case 'total_revenue':
          comparison = a.total_revenue - b.total_revenue;
          break;
        case 'last_activity':
          comparison = new Date(a.last_activity).getTime() - new Date(b.last_activity).getTime();
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [workspaces, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleEnterWorkspace = async (workspaceId: string, workspaceName: string) => {
    try {
      await startImpersonation(workspaceId, workspaceName);
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to start impersonation:', error);
      // Still navigate even if logging fails for UX
      navigate('/dashboard');
    }
  };

  const aggregatedTotals = useMemo(() => {
    return {
      totalWorkspaces: workspaces.length,
      totalOrders: workspaces.reduce((sum, ws) => sum + (ws.total_orders || 0), 0),
      totalRevenue: workspaces.reduce((sum, ws) => sum + (ws.total_revenue || 0), 0),
    };
  }, [workspaces]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return `MAD ${amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}`;
  };

  const renderIntegrationBadge = (integration: string, isActive: boolean) => {
    const colors = {
      ozon: 'bg-blue-100 text-blue-800',
      ameex: 'bg-purple-100 text-purple-800',
      sendit: 'bg-green-100 text-green-800',
      youcan: 'bg-orange-100 text-orange-800',
      whatsapp: 'bg-emerald-100 text-emerald-800',
      shopify: 'bg-cyan-100 text-cyan-800',
    };
    
    const colorClass = colors[integration as keyof typeof colors] || 'bg-gray-100 text-gray-800';
    
    return isActive ? (
      <span key={integration} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
        <CheckCircle size={10} className="mr-1" />
        {integration}
      </span>
    ) : null;
  };

  if (loading || dataLoading) return <PlatformLoading />;

  const isAuthorized = session?.user?.email?.toLowerCase() === "ziadennachat5@gmail.com";
  
  if (!isAuthorized) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Founder Internal Access</h1>
          <p className="text-gray-600">
            Vue globale sur tous les workspaces/clients de l'application
          </p>
        </div>

        {/* Aggregated Totals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Workspaces</p>
                <p className="text-2xl font-bold text-gray-900">{aggregatedTotals.totalWorkspaces}</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Commandes</p>
                <p className="text-2xl font-bold text-gray-900">{aggregatedTotals.totalOrders.toLocaleString()}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Revenu Total</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(aggregatedTotals.totalRevenue)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Workspace Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Workspaces Overview</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    { field: 'workspace_name' as SortField, label: 'Workspace / Client', icon: Building2 },
                    { field: 'created_at' as SortField, label: 'Date Création', icon: Calendar },
                    { field: 'total_orders' as SortField, label: 'Commandes', icon: ShoppingCart },
                    { field: 'total_revenue' as SortField, label: 'Revenu', icon: DollarSign },
                    { field: 'last_activity' as SortField, label: 'Dernière Activité', icon: Activity },
                  ].map(({ field, label, icon: Icon }) => (
                    <th
                      key={field}
                      onClick={() => handleSort(field)}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-1">
                        <Icon size={14} />
                        {label}
                        {sortField === field && (
                          <ArrowUpDown size={12} className={sortDirection === 'asc' ? 'rotate-180' : ''} />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Intégrations Actives
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedWorkspaces.map((workspace) => (
                  <tr key={workspace.workspace_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{workspace.workspace_name}</div>
                      <div className="text-xs text-gray-500">{workspace.workspace_id.slice(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(workspace.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {workspace.total_orders.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(workspace.total_revenue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(workspace.last_activity)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(workspace.active_integrations || {}).map(([integration, isActive]) =>
                          renderIntegrationBadge(integration, isActive)
                        )}
                        {Object.keys(workspace.active_integrations || {}).length === 0 && (
                          <span className="text-xs text-gray-400">Aucune</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEnterWorkspace(workspace.workspace_id, workspace.workspace_name)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-medium transition-colors"
                          title="Entrer dans ce workspace (lecture seule)"
                        >
                          <LogIn size={12} />
                          Entrer
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-md text-xs font-medium transition-colors"
                          title="Suspendre le workspace"
                        >
                          <Pause size={12} />
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-md text-xs font-medium transition-colors"
                          title="Supprimer le workspace"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedWorkspaces.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      Aucun workspace trouvé
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> Cette page est intentionnellement cachée de toute navigation.
            Toutes les opérations de données sont protégées par des politiques RLS côté serveur et des edge functions.
            Le revenu calculé correspond uniquement aux commandes livrées (statut DELIVERED).
          </p>
        </div>
      </div>
    </div>
  );
}
