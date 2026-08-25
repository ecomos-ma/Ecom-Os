import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard } from "../../components/admin/AdminStatCard";
import { 
  RefreshCw, 
  Search,
  User,
  Building2,
  Package,
  ShoppingCart,
  Activity,
  Clock,
  Zap,
  Settings,
  TrendingUp,
  ExternalLink
} from "lucide-react";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState<string>("all");
  const [recentItems, setRecentItems] = useState<any[]>([]);

  useEffect(() => {
    fetchRecentItems();
  }, []);

  async function fetchRecentItems() {
    try {
      const [usersRes, workspacesRes, ordersRes, productsRes] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, role').order('created_at', { ascending: false }).limit(5),
        supabase.from('workspaces').select('id, name').order('created_at', { ascending: false }).limit(5),
        supabase.from('orders').select('id, order_number, total').order('created_at', { ascending: false }).limit(5),
        supabase.from('products').select('id, name, sku').order('created_at', { ascending: false }).limit(5),
      ]);

      const recent = [
        ...(usersRes.data || []).map((u: any) => ({ type: 'user', ...u })),
        ...(workspacesRes.data || []).map((w: any) => ({ type: 'workspace', ...w })),
        ...(ordersRes.data || []).map((o: any) => ({ type: 'order', ...o })),
        ...(productsRes.data || []).map((p: any) => ({ type: 'product', ...p })),
      ];

      setRecentItems(recent);
    } catch (error) {
      console.error('Error fetching recent items:', error);
    }
  }

  async function handleSearch() {
    if (!query.trim()) {
      setResults(recentItems);
      return;
    }
    
    setLoading(true);
    try {
      const searchResults: any[] = [];
      
      if (searchType === 'all' || searchType === 'users') {
        const { data: users } = await supabase
          .from('profiles')
          .select('id, email, full_name, role')
          .or(`email.ilike.%${query}%,full_name.ilike.%${query}%`)
          .limit(10);
        
        users?.forEach((u: any) => {
          searchResults.push({ type: 'user', ...u });
        });
      }
      
      if (searchType === 'all' || searchType === 'workspaces') {
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id, name')
          .ilike('name', `%${query}%`)
          .limit(10);
        
        workspaces?.forEach((w: any) => {
          searchResults.push({ type: 'workspace', ...w });
        });
      }
      
      if (searchType === 'all' || searchType === 'orders') {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, order_number, total')
          .ilike('order_number', `%${query}%`)
          .limit(10);
        
        orders?.forEach((o: any) => {
          searchResults.push({ type: 'order', ...o });
        });
      }
      
      if (searchType === 'all' || searchType === 'products') {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, sku')
          .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
          .limit(10);
        
        products?.forEach((p: any) => {
          searchResults.push({ type: 'product', ...p });
        });
      }
      
      setResults(searchResults);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (query.trim()) {
      handleSearch();
    } else {
      setResults(recentItems);
    }
  }, [query, searchType]);

  function getIcon(type: string) {
    switch (type) {
      case 'user': return User;
      case 'workspace': return Building2;
      case 'product': return Package;
      case 'order': return ShoppingCart;
      default: return Search;
    }
  }

  function getTypeColor(type: string) {
    switch (type) {
      case 'user': return 'text-blue-400 bg-blue-500/20';
      case 'workspace': return 'text-purple-400 bg-purple-500/20';
      case 'product': return 'text-emerald-400 bg-emerald-500/20';
      case 'order': return 'text-brand-accent bg-brand-accent/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  }

  const quickActions = [
    { label: 'View Dashboard', icon: TrendingUp, action: () => {} },
    { label: 'Manage Users', icon: User, action: () => {} },
    { label: 'View Workspaces', icon: Building2, action: () => {} },
    { label: 'View Orders', icon: ShoppingCart, action: () => {} },
    { label: 'System Health', icon: Zap, action: () => {} },
    { label: 'Platform Settings', icon: Settings, action: () => {} },
  ];

  return (
    <div className="p-6">
      <AdminPageHeader
        title="Global Search"
        description="Search across all platform entities"
      />

      <div className="mb-6 flex gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search users, workspaces, orders, products..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-800 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-brand-accent transition-colors"
            />
          </div>
        </div>
        <select
          value={searchType}
          onChange={(e) => setSearchType(e.target.value)}
          className="px-4 py-2.5 bg-slate-900/50 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-accent transition-colors"
        >
          <option value="all">All</option>
          <option value="users">Users</option>
          <option value="workspaces">Workspaces</option>
          <option value="orders">Orders</option>
          <option value="products">Products</option>
        </select>
      </div>

      {!query && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-400 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={action.action}
                className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:bg-slate-800/50 transition-colors text-left group"
              >
                <action.icon size={20} className="text-brand-accent mb-3 group-hover:scale-110 transition-transform" />
                <div className="text-sm text-white">{action.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!query && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-400 mb-4">Recent Items</h3>
          <div className="space-y-3">
            {recentItems.slice(0, 10).map((item) => {
              const Icon = getIcon(item.type);
              return (
                <div key={`${item.type}-${item.id}`} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-center gap-4 hover:bg-slate-800/30 transition-colors cursor-pointer">
                  <div className={`p-2 rounded-lg ${getTypeColor(item.type)}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-white">
                      {item.type === 'user' && (item.full_name || item.email?.split('@')[0])}
                      {item.type === 'workspace' && item.name}
                      {item.type === 'product' && item.name}
                      {item.type === 'order' && item.order_number}
                    </div>
                    <div className="text-sm text-slate-400">
                      {item.type === 'user' && item.email}
                      {item.type === 'workspace' && `ID: ${item.id.slice(0, 8)}...`}
                      {item.type === 'product' && `SKU: ${item.sku}`}
                      {item.type === 'order' && `$${item.total}`}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getTypeColor(item.type)}`}>
                    {item.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {query && (
        <div className="space-y-3">
          {results.map((result) => {
            const Icon = getIcon(result.type);
            return (
              <div key={`${result.type}-${result.id}`} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-center gap-4 hover:bg-slate-800/30 transition-colors cursor-pointer">
                <div className={`p-2 rounded-lg ${getTypeColor(result.type)}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white">
                    {result.type === 'user' && (result.full_name || result.email?.split('@')[0])}
                    {result.type === 'workspace' && result.name}
                    {result.type === 'product' && result.name}
                    {result.type === 'order' && result.order_number}
                  </div>
                  <div className="text-sm text-slate-400">
                    {result.type === 'user' && result.email}
                    {result.type === 'workspace' && `ID: ${result.id.slice(0, 8)}...`}
                    {result.type === 'product' && `SKU: ${result.sku}`}
                    {result.type === 'order' && `$${result.total}`}
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getTypeColor(result.type)}`}>
                  {result.type}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}