import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard } from "../../components/admin/AdminStatCard";
import {
  TrendingUp,
  RefreshCw,
  Package,
  Store,
  ArrowUpDown
} from "lucide-react";

interface ProductData {
  sku: string;
  name: any;
  revenue: any;
  orders: any;
  delivered: any;
  confirmationRate: number;
  returnRate: number;
  refusedRate: number;
}

interface WorkspaceData {
  workspaceId: string;
  name: string;
  revenue: number;
  orders: number;
  delivered: number;
  total: number;
  returned: number;
  refused: number;
  productCount: number;
}

type RankingMetric = 'revenue' | 'orders' | 'delivered' | 'confirmationRate' | 'returnRate';

export default function Intelligence() {
  const [loading, setLoading] = useState(true);
  const [winningProducts, setWinningProducts] = useState<ProductData[]>([]);
  const [winningStores, setWinningStores] = useState<WorkspaceData[]>([]);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>('revenue');

  const rankingMetrics = [
    { value: 'revenue' as RankingMetric, label: 'Total Revenue' },
    { value: 'orders' as RankingMetric, label: 'Total Orders' },
    { value: 'delivered' as RankingMetric, label: 'Delivered Orders' },
    { value: 'confirmationRate' as RankingMetric, label: 'Confirmation Rate' },
    { value: 'returnRate' as RankingMetric, label: 'Return Rate' },
  ];

  useEffect(() => {
    fetchIntelligence();
  }, [rankingMetric]);

  async function fetchIntelligence() {
    try {
      setLoading(true);
      
      const [ordersRes, productsRes, workspacesRes] = await Promise.all([
        supabase.from('orders').select('workspace_id, total, status, created_at, sku'),
        supabase.from('products').select('name, sku, sales_count'),
        supabase.from('workspaces').select('id, name, created_at'),
      ]);

      const productData: Record<string, any> = {};
      (ordersRes.data || []).forEach(order => {
        if (order.sku) {
          if (!productData[order.sku]) {
            productData[order.sku] = { 
              sku: order.sku, 
              revenue: 0, 
              orders: 0, 
              delivered: 0,
              total: 0,
              returned: 0,
              refused: 0
            };
          }
          productData[order.sku].revenue += Number(order.total || 0);
          productData[order.sku].orders += 1;
          productData[order.sku].total += 1;
          if (order.status === 'delivered' || order.status === 'LIVRE') {
            productData[order.sku].delivered += 1;
          }
          if (order.status === 'returned') {
            productData[order.sku].returned += 1;
          }
          if (order.status === 'refused' || order.status === 'CANCELED') {
            productData[order.sku].refused += 1;
          }
        }
      });

      const winningProductsData = Object.entries(productData)
        .map(([sku, data]) => {
          const product = (productsRes.data || []).find(p => p.sku === sku);
          return {
            sku,
            name: product?.name || sku,
            revenue: data.revenue,
            orders: data.orders,
            delivered: data.delivered,
            confirmationRate: data.total > 0 ? (data.delivered / data.total) * 100 : 0,
            returnRate: data.total > 0 ? (data.returned / data.total) * 100 : 0,
            refusedRate: data.total > 0 ? (data.refused / data.total) * 100 : 0,
          };
        })
        .sort((a, b) => (b[rankingMetric] as number) - (a[rankingMetric] as number))
        .slice(0, 10);

      const workspaceData: Record<string, any> = {};
      (ordersRes.data || []).forEach(order => {
        const wsId = order.workspace_id;
        if (!workspaceData[wsId]) {
          workspaceData[wsId] = { 
            workspaceId: wsId, 
            revenue: 0, 
            orders: 0, 
            delivered: 0,
            total: 0,
            returned: 0,
            refused: 0,
            productCount: 0
          };
        }
        workspaceData[wsId].revenue += Number(order.total || 0);
        workspaceData[wsId].orders += 1;
        workspaceData[wsId].total += 1;
        if (order.status === 'delivered' || order.status === 'LIVRE') {
          workspaceData[wsId].delivered += 1;
        }
        if (order.status === 'returned') {
          workspaceData[wsId].returned += 1;
        }
        if (order.status === 'refused' || order.status === 'CANCELED') {
          workspaceData[wsId].refused += 1;
        }
      });

      const winningStoresData = Object.entries(workspaceData)
        .map(([workspaceId, data]) => {
          const workspace = (workspacesRes.data || []).find(w => w.id === workspaceId);
          return {
            workspaceId,
            name: workspace?.name || 'Unknown',
            revenue: data.revenue,
            orders: data.orders,
            delivered: data.delivered,
            total: data.total,
            returned: data.returned,
            refused: data.refused,
            confirmationRate: data.total > 0 ? (data.delivered / data.total) * 100 : 0,
            returnRate: data.total > 0 ? (data.returned / data.total) * 100 : 0,
            refusedRate: data.total > 0 ? (data.refused / data.total) * 100 : 0,
            productCount: (productsRes.data || []).length,
          };
        })
        .sort((a, b) => (b[rankingMetric] as number) - (a[rankingMetric] as number))
        .slice(0, 10);

      setWinningProducts(winningProductsData);
      setWinningStores(winningStoresData);
    } catch (error) {
      console.error('Error fetching intelligence:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <AdminPageHeader
        title="Intelligence"
        description="Platform insights and analytics"
        actions={
          <button
            onClick={fetchIntelligence}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        }
      />

      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Rank by:</span>
          <select
            value={rankingMetric}
            onChange={(e) => setRankingMetric(e.target.value as RankingMetric)}
            className="px-4 py-2.5 bg-slate-900/50 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-accent transition-colors"
          >
            {rankingMetrics.map(metric => (
              <option key={metric.value} value={metric.value}>{metric.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-brand-accent" />
            Winning Products
          </h3>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse h-16 bg-slate-800/50 rounded-lg"></div>
              ))
            ) : winningProducts.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No products found</div>
            ) : (
              winningProducts.map((product, index) => (
                <div key={product.sku} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center font-bold text-brand-accent">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{product.name}</div>
                      <div className="text-xs text-slate-400">{product.sku}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-emerald-400">${product.revenue.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">{product.orders} orders</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Store size={20} className="text-purple-400" />
            Winning Stores
          </h3>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse h-16 bg-slate-800/50 rounded-lg"></div>
              ))
            ) : winningStores.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No stores found</div>
            ) : (
              winningStores.map((store, index) => (
                <div key={store.workspaceId} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center font-bold text-purple-400">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{store.name}</div>
                      <div className="text-xs text-slate-400">{store.productCount} products</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-emerald-400">${store.revenue.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">{store.orders} orders</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}