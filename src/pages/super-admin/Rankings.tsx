import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { 
  Trophy, 
  RefreshCw, 
  TrendingUp,
  Store,
  Package,
  DollarSign
} from "lucide-react";

export default function Rankings() {
  const [loading, setLoading] = useState(true);
  const [topSellers, setTopSellers] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topWorkspaces, setTopWorkspaces] = useState<any[]>([]);

  useEffect(() => {
    fetchRankings();
  }, []);

  async function fetchRankings() {
    try {
      setLoading(true);
      
      const [ordersRes, productsRes, workspacesRes] = await Promise.all([
        supabase.from('orders').select('workspace_id, total, created_at'),
        supabase.from('products').select('name, sales_count, sku'),
        supabase.from('workspaces').select('id, name, created_at'),
      ]);

      // Calculate top sellers by workspace revenue
      const workspaceRevenue: Record<string, number> = {};
      (ordersRes.data || []).forEach(order => {
        const wsId = order.workspace_id;
        workspaceRevenue[wsId] = (workspaceRevenue[wsId] || 0) + Number(order.total || 0);
      });

      const topSellersData = Object.entries(workspaceRevenue)
        .map(([workspaceId, revenue]) => ({ workspaceId, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Top products
      const topProductsData = (productsRes.data || [])
        .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        .slice(0, 10);

      // Top workspaces by order count
      const workspaceOrderCount: Record<string, number> = {};
      (ordersRes.data || []).forEach(order => {
        const wsId = order.workspace_id;
        workspaceOrderCount[wsId] = (workspaceOrderCount[wsId] || 0) + 1;
      });

      const topWorkspacesData = Object.entries(workspaceOrderCount)
        .map(([workspaceId, count]) => ({ workspaceId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setTopSellers(topSellersData);
      setTopProducts(topProductsData);
      setTopWorkspaces(topWorkspacesData);
    } catch (error) {
      console.error('Error fetching rankings:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Rankings</h1>
        <p className="text-slate-400">Top performers across the platform</p>
      </div>

      <div className="mb-6">
        <button
          onClick={fetchRankings}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Sellers */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Trophy size={20} className="text-yellow-400" />
            Top Sellers
          </h3>
          <div className="space-y-3">
            {topSellers.map((seller, index) => (
              <div key={seller.workspaceId} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-amber-600' : 'bg-slate-700'
                  } text-white`}>
                    {index + 1}
                  </div>
                  <div>
                    <div className="text-sm text-white">Workspace {seller.workspaceId.slice(0, 8)}...</div>
                  </div>
                </div>
                <div className="text-sm font-semibold text-emerald-400">
                  ${seller.revenue.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Package size={20} className="text-purple-400" />
            Top Products
          </h3>
          <div className="space-y-3">
            {topProducts.map((product, index) => (
              <div key={product.sku} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-amber-600' : 'bg-slate-700'
                  } text-white`}>
                    {index + 1}
                  </div>
                  <div>
                    <div className="text-sm text-white">{product.name}</div>
                  </div>
                </div>
                <div className="text-sm font-semibold text-blue-400">
                  {product.sales_count || 0} sales
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Workspaces */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Store size={20} className="text-emerald-400" />
            Top Workspaces
          </h3>
          <div className="space-y-3">
            {topWorkspaces.map((workspace, index) => (
              <div key={workspace.workspaceId} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-amber-600' : 'bg-slate-700'
                  } text-white`}>
                    {index + 1}
                  </div>
                  <div>
                    <div className="text-sm text-white">Workspace {workspace.workspaceId.slice(0, 8)}...</div>
                  </div>
                </div>
                <div className="text-sm font-semibold text-purple-400">
                  {workspace.count} orders
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}