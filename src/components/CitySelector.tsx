import { useState, useEffect, useRef } from "react";
import { MapPin, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { ShippingCarrier } from "../lib/types";
import { useAuth } from "../hooks/useAuth";

export interface OzonCity {
  id: number;
  ref: string;
  name: string;
  delivered_price: number;
  returned_price: number;
  refused_price: number;
}

export interface ColiatyCity {
  id: number;
  name: string;
}

export interface ForceLogCity {
  provider_city_id: number;
  code: string;
  name: string;
  delivered_price: number | null;
  same_city_price: number | null;
}

export interface AmeexCity {
  ameex_city_id: number;
  display_name: string;
  normalized_city: string;
  aliases: string[];
}

/** Matches the sendit_city_mappings table schema */
export interface SenditCity {
  sendit_city_id: number;
  city_name: string;
  arabic_name?: string | null;
  price?: number | null;
  delais?: string | null;
  is_pickup_city?: boolean;
}

export interface CitySelectorValue {
  ozon_city_id?: number | null;
  carrier_city_id?: number | null;
  carrier_city_price?: number | null;
  city_name: string;
  raw_city?: string | null;
}

interface CitySelectorProps {
  value: CitySelectorValue;
  onChange: (value: CitySelectorValue) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  showWarning?: boolean;
  carrier?: ShippingCarrier;
}

export function CitySelector({
  value,
  onChange,
  placeholder = "Search city...",
  required = false,
  disabled = false,
  showWarning = false,
  carrier = 'ozon',
}: CitySelectorProps) {
  const { workspace } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Array<OzonCity | ColiatyCity | ForceLogCity | AmeexCity | SenditCity>>([]);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAmeex = carrier === 'ameex';
  const isSendit = carrier === 'sendit';
  const tableName = carrier === 'forcelog' ? 'forcelog_cities'
    : carrier === 'coliaty' ? 'coliaty_cities'
    : carrier === 'ameex' ? 'ameex_city_mappings'
    : carrier === 'sendit' ? 'sendit_city_mappings'
    : 'ozon_cities';
  const hasCityId = carrier === 'ozon' ? value.ozon_city_id : value.carrier_city_id;

  // Load default cities on focus if empty
  useEffect(() => {
    if (isOpen && searchQuery.trim().length === 0 && results.length === 0) {
      loadDefaultCities();
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchCities(searchQuery);
      } else if (searchQuery.trim().length === 0) {
        // Show default cities when cleared
        loadDefaultCities();
      } else {
        setResults([]);
        setNoResults(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadDefaultCities = async () => {
    setLoading(true);
    setNoResults(false);

    try {
      const columnName = isSendit ? "city_name" : isAmeex ? "display_name" : "name";
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .order(columnName)
        .limit(isSendit ? 100 : 1000);

      if (error) throw error;
      setResults(data || []);
      setNoResults((data || []).length === 0);
    } catch (error) {
      console.error("Error loading default cities:", error);
      setResults([]);
      setNoResults(true);
    } finally {
      setLoading(false);
    }
  };

  const searchCities = async (query: string) => {
    setLoading(true);
    setNoResults(false);

    try {
      const columnName = isSendit ? "city_name" : isAmeex ? "display_name" : "name";
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .ilike(columnName, `%${query}%`)
        .order(columnName)
        .limit(50);

      if (error) throw error;
      setResults(data || []);
      setNoResults((data || []).length === 0);
    } catch (error) {
      console.error("Error searching cities:", error);
      setResults([]);
      setNoResults(true);
    } finally {
      setLoading(false);
    }
  };

  const saveToCityArabicNames = async (arabicName: string, carrierCityId: number) => {
    if (carrier === 'ozon' || carrier === 'ameex') return;
    
    try {
      // Check if mapping already exists
      const { data: existing } = await supabase
        .from('city_arabic_names')
        .select('*')
        .eq('carrier', carrier)
        .eq('arabic_name', arabicName)
        .single();

      if (!existing) {
        // Insert new mapping
        await supabase
          .from('city_arabic_names')
          .insert({
            carrier,
            arabic_name: arabicName,
            carrier_city_id: carrierCityId,
            ozon_city_id: null
          });
        console.log(`Saved ${carrier} mapping: "${arabicName}" -> ${carrierCityId}`);
      }
    } catch (error) {
      console.error("Error saving city mapping:", error);
    }
  };

  const saveSenditMapping = async (rawCity: string, city: SenditCity) => {
    if (!workspace?.id || !rawCity.trim()) return;
    const normalized = rawCity.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
    if (!normalized) return;
    await supabase.rpc("upsert_city_mapping", {
      p_workspace_id: workspace.id,
      p_provider_key: "sendit",
      p_raw_city: rawCity,
      p_normalized_raw_city: normalized,
      p_provider_city_id: String(city.sendit_city_id),
      p_provider_city_name: city.city_name,
      p_provider_city_code: null,
      p_confidence: 1,
      p_source: "learned",
    });
  };

  const handleSelectCity = (city: OzonCity | ColiatyCity | ForceLogCity | AmeexCity | SenditCity) => {
    const cityName = isSendit
      ? (city as SenditCity).city_name
      : 'display_name' in city
        ? (city as AmeexCity).display_name
        : (city as OzonCity | ColiatyCity | ForceLogCity).name;
    const newValue: CitySelectorValue = {
      city_name: cityName,
      raw_city: value.raw_city || value.city_name || searchQuery || cityName,
    };

    if (carrier === 'sendit') {
      newValue.carrier_city_id = (city as SenditCity).sendit_city_id;
      const quotedPrice = Number((city as SenditCity).price);
      newValue.carrier_city_price = Number.isFinite(quotedPrice) ? quotedPrice : null;
      newValue.ozon_city_id = null;
      if (value.city_name) {
        void saveToCityArabicNames(value.city_name, (city as SenditCity).sendit_city_id);
        void saveSenditMapping(value.city_name, city as SenditCity);
      }
    } else if (carrier === 'ameex') {
      newValue.carrier_city_id = (city as AmeexCity).ameex_city_id;
      newValue.ozon_city_id = null;
    } else if (carrier !== 'ozon') {
      const providerCityId = 'provider_city_id' in city ? city.provider_city_id : (city as OzonCity | ColiatyCity).id;
      newValue.carrier_city_id = providerCityId;
      newValue.ozon_city_id = null;
      // Save mapping for future automatic resolution
      if (value.city_name) {
        saveToCityArabicNames(value.city_name, providerCityId);
      }
    } else {
      newValue.ozon_city_id = (city as OzonCity | ColiatyCity).id;
      newValue.carrier_city_id = null;
    }

    onChange(newValue);
    setSearchQuery("");
    setIsOpen(false);
    setResults([]);
  };

  const handleClear = () => {
    const newValue: CitySelectorValue = {
      city_name: "",
      raw_city: "",
      ozon_city_id: null,
      carrier_city_id: null,
      carrier_city_price: null,
    };
    onChange(newValue);
    setSearchQuery("");
  };

  const displayValue = value.city_name || searchQuery;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
          <MapPin size={16} />
        </div>
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
            // Clear selection when user starts typing
            if (hasCityId) {
              const newValue: CitySelectorValue = {
                city_name: e.target.value,
                raw_city: e.target.value,
                ozon_city_id: null,
                carrier_city_id: null,
                carrier_city_price: null,
              };
              onChange(newValue);
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`w-full rounded-lg border border-base-border bg-base-raised pl-10 pr-10 py-2 text-[13px] text-ink focus:border-brand-accent/50 focus:outline-none disabled:opacity-60 ${
            showWarning && !hasCityId ? "border-warn/50 bg-warn/5" : ""
          }`}
        />
        {displayValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          >
            <span className="text-[14px]">×</span>
          </button>
        )}
      </div>

      {showWarning && !hasCityId && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-warn">
          <AlertCircle size={12} />
          <span>City to verify - please select from dropdown</span>
        </div>
      )}

      {isOpen && (results.length > 0 || loading || noResults) && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-base-border bg-base-surface shadow-lg">
          {loading && (
            <div className="flex items-center justify-center py-4 text-[12px] text-ink-muted">
              Searching...
            </div>
          )}

          {!loading && noResults && (
            <div className="flex items-center justify-center py-4 text-[12px] text-ink-muted">
              No cities found
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-1">
              {results.map((city) => {
                const cityName = isSendit
                  ? (city as SenditCity).city_name
                  : 'display_name' in city
                    ? (city as AmeexCity).display_name
                    : (city as OzonCity | ColiatyCity | ForceLogCity).name;
                const cityKey = isSendit
                  ? (city as SenditCity).sendit_city_id
                  : 'ameex_city_id' in city
                    ? (city as AmeexCity).ameex_city_id
                    : 'provider_city_id' in city
                      ? (city as ForceLogCity).provider_city_id
                      : (city as OzonCity | ColiatyCity).id;
                return (
                  <button
                    key={cityKey}
                    type="button"
                    onClick={() => handleSelectCity(city)}
                    className="w-full px-3 py-2 text-left text-[13px] text-ink hover:bg-brand-accent/10 focus:bg-brand-accent/10 focus:outline-none"
                  >
                    <div className="font-medium">{cityName}</div>
                    {carrier === 'ozon' && 'ref' in city && (
                      <div className="text-[11px] text-ink-muted">
                        {(city as OzonCity).ref} • Delivery: {(city as OzonCity).delivered_price} DH
                      </div>
                    )}
                    {carrier === 'forcelog' && 'code' in city && (
                      <div className="text-[11px] text-ink-muted">
                        {(city as ForceLogCity).code} {(city as ForceLogCity).delivered_price != null ? `• Delivery: ${(city as ForceLogCity).delivered_price} DH` : ''}
                      </div>
                    )}
                    {carrier === 'ameex' && 'ameex_city_id' in city && (
                      <div className="text-[11px] text-ink-muted">
                        ID: {(city as AmeexCity).ameex_city_id}
                      </div>
                    )}
                    {carrier === 'sendit' && 'sendit_city_id' in city && (
                      <div className="text-[11px] text-ink-muted">
                        {(city as SenditCity).arabic_name ? `${(city as SenditCity).arabic_name} • ` : ''}
                        {(city as SenditCity).price != null ? `${(city as SenditCity).price} DH` : ''}
                        {(city as SenditCity).delais ? ` • ${(city as SenditCity).delais}` : ''}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
