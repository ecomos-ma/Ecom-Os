import { supabase } from "../lib/supabase";

/**
 * Shipping Price Service
 * 
 * Provides efficient shipping price lookup by city name
 * Uses the ozon_cities table with proper caching
 */

interface OzonCity {
  id: number;
  ref: string;
  name: string;
  delivered_price: number;
  returned_price: number;
  refused_price: number;
}

// Simple in-memory cache for city prices
const cityPriceCache = new Map<string, OzonCity | null>();
let cacheInitialized = false;

/**
 * Initialize the city price cache by loading all cities
 * This is done once per session to improve performance
 */
async function initializeCityCache(): Promise<void> {
  if (cacheInitialized) return;

  try {
    const { data, error } = await supabase
      .from('ozon_cities')
      .select('id, ref, name, delivered_price, returned_price, refused_price');

    if (error) {
      console.warn('[ShippingPriceService] ozon_cities table not available:', error.message);
      // Don't block - mark as initialized so we don't keep trying
      cacheInitialized = true;
      return;
    }

    if (data) {
      data.forEach(city => {
        // Cache by both name and ref for flexible matching
        cityPriceCache.set(city.name.toLowerCase(), city);
        cityPriceCache.set(city.ref.toLowerCase(), city);
      });
      cacheInitialized = true;
      console.log(`[ShippingPriceService] Cached ${data.length} cities`);
    }
  } catch (error) {
    console.warn('[ShippingPriceService] Cache initialization error:', error);
    // Don't block - mark as initialized so we don't keep trying
    cacheInitialized = true;
  }
}

/**
 * Get shipping price for a given city
 * 
 * @param cityName - The name of the city
 * @returns The shipping price in MAD, or null if city not found
 */
export async function getShippingPrice(cityName: string | null | undefined): Promise<number | null> {
  if (!cityName || String(cityName).trim() === '') {
    return null;
  }

  // Initialize cache if needed
  if (!cacheInitialized) {
    await initializeCityCache();
  }

  const normalizedCity = String(cityName).trim().toLowerCase();
  
  // Check cache first
  if (cityPriceCache.has(normalizedCity)) {
    const city = cityPriceCache.get(normalizedCity);
    return city?.delivered_price ?? null;
  }

  // If not in cache, try direct database lookup
  try {
    const { data, error } = await supabase
      .from('ozon_cities')
      .select('delivered_price')
      .or(`name.ilike.${normalizedCity},ref.ilike.${normalizedCity}`)
      .maybeSingle();

    if (error) {
      console.warn('[ShippingPriceService] Database lookup error:', error.message);
      return null;
    }

    if (data) {
      // Cache the result for future lookups
      cityPriceCache.set(normalizedCity, { 
        id: 0, 
        ref: '', 
        name: cityName, 
        delivered_price: data.delivered_price, 
        returned_price: 0, 
        refused_price: 0 
      } as OzonCity);
      return data.delivered_price;
    }

    // Cache the negative result to avoid repeated lookups
    cityPriceCache.set(normalizedCity, null);
    return null;
  } catch (error) {
    console.warn('[ShippingPriceService] Lookup error:', error);
    return null;
  }
}

/**
 * Get shipping price synchronously (uses cache only)
 * 
 * @param cityName - The name of the city
 * @returns The shipping price in MAD, or null if city not found in cache
 */
export function getShippingPriceSync(cityName: string | null | undefined): number | null {
  try {
    if (!cityName || String(cityName).trim() === '') {
      return null;
    }

    const normalizedCity = String(cityName).trim().toLowerCase();
    
    if (cityPriceCache.has(normalizedCity)) {
      const city = cityPriceCache.get(normalizedCity);
      return city?.delivered_price ?? null;
    }

    return null;
  } catch (error) {
    console.warn('[ShippingPriceService] Sync lookup error:', error);
    return null;
  }
}

/**
 * Calculate net COD after shipping costs
 * 
 * @param totalCOD - The total COD amount
 * @param shippingPrice - The shipping cost
 * @returns The net COD amount
 */
export function calculateNetCOD(totalCOD: number, shippingPrice: number | null): number {
  if (shippingPrice === null) return totalCOD;
  // If shipping price is negative (refused), add it to total COD
  // If shipping price is positive (delivered), subtract it from total COD
  return totalCOD - shippingPrice;
}

/**
 * Format price in MAD
 * 
 * @param price - The price value
 * @returns Formatted price string
 */
export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return '—';
  return `${Number(price).toLocaleString('fr-MA', { maximumFractionDigits: 0 })} MAD`;
}

/**
 * Preload city prices for better performance
 * Call this during app initialization
 */
export async function preloadCityPrices(): Promise<void> {
  await initializeCityCache();
}
