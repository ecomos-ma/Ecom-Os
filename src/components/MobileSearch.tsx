import { useState, useEffect } from "react";
import { Search, X, Clock, Package, User, MapPin, BarChart3 } from "lucide-react";
import MobileBottomSheet from "./MobileBottomSheet";

interface MobileSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileSearch({ isOpen, onClose }: MobileSearchProps) {
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    // Load recent searches from localStorage
    const saved = localStorage.getItem("recentSearches");
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  const searchCategories = [
    { icon: Package, label: "Orders", count: 1234 },
    { icon: Package, label: "Products", count: 567 },
    { icon: User, label: "Customers", count: 890 },
    { icon: MapPin, label: "Cities", count: 45 },
    { icon: BarChart3, label: "Campaigns", count: 23 },
  ];

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Search"
      snapPoints={["90%"]}
    >
      {/* Search Input */}
      <div className="relative mb-4">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search orders, products, customers..."
          className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-base-raised border border-base-border text-[15px] text-ink placeholder:text-ink-muted focus:border-brand/50 focus:ring-2 focus:ring-brand/10 outline-none transition-all"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2"
          >
            <X size={18} className="text-ink-muted" />
          </button>
        )}
      </div>

      {/* Recent Searches */}
      {recentSearches.length > 0 && !query && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold text-ink">Recent Searches</h3>
            <button className="text-[13px] text-brand font-medium">Clear All</button>
          </div>
          <div className="space-y-2">
            {recentSearches.slice(0, 5).map((search, index) => (
              <button
                key={index}
                onClick={() => setQuery(search)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-base-raised border border-base-border/50 active:scale-[0.98] transition-transform"
              >
                <Clock size={16} className="text-ink-muted" />
                <span className="text-[14px] text-ink">{search}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Categories */}
      {!query && (
        <div>
          <h3 className="text-[15px] font-semibold text-ink mb-3">Browse Categories</h3>
          <div className="grid grid-cols-2 gap-3">
            {searchCategories.map((category, index) => {
              const Icon = category.icon;
              return (
                <button
                  key={index}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-base-raised border border-base-border/50 active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                    <Icon size={18} className="text-brand" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-medium text-ink">{category.label}</p>
                    <p className="text-[11px] text-ink-muted">{category.count} items</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Results */}
      {query && (
        <div>
          <h3 className="text-[15px] font-semibold text-ink mb-3">Results</h3>
          <div className="text-center py-8">
            <Search size={48} className="text-ink-muted mx-auto mb-3" />
            <p className="text-[14px] text-ink-muted">No results found for "{query}"</p>
          </div>
        </div>
      )}
    </MobileBottomSheet>
  );
}
