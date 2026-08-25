import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Eye, RefreshCw, Store, Package, ShoppingCart } from "lucide-react";

export default function SpyCenter() {
  const [loading, setLoading] = useState(true);
  const [newestOrders, setNewestOrders] = useState<any[]>([]);
  const [newestProducts, setNewestProducts] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const [ordersRes, productsRes] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('products').select('*').order('created_at', { ascending: false }).limit(10),
      ]);
      setNewestOrders(ordersRes.data || []);
      setNewestProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching spy data:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Spy Center</h1>
        <p className="text-slate-400">Real-time platform intelligence</p>
      </div>

      <div className="mb-6">
        <button onClick={fetchData} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2">
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <ShoppingCart size={20} className="text-brand-accent" />
            Newest Orders
          </h3>
          <div className="space-y-2">
            {newestOrders.map(order => (
              <div key={order.id} className="p-3 bg-slate-800/30 rounded text-sm text-white">
                {order.order_number} - ${order.total}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Package size={20} className="text-purple-400" />
            Newest Products
          </h3>
          <div className="space-y-2">
            {newestProducts.map(product => (
              <div key={product.id} className="p-3 bg-slate-800/30 rounded text-sm text-white">
                {product.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}