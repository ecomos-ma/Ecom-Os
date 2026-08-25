// ─── Ozon Express API Service ─────────────────────────────────────────────────
// Service layer for the Ozon Express shipping API (api.ozonexpress.ma).
// Uses multipart/form-data as required by their endpoint specification.
// Integrates with the existing ShippingRepository for request/response auditing.

import type {
  OzonConfig,
  OzonParcelRequest,
  OzonParcelResponse,
  OzonResult,
  OzonTrackingResponse,
  OzonDeliveryNoteResult,
} from "../types/ozon";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabase";
import { getShippingPrice, formatPrice, calculateNetCOD, preloadCityPrices, getShippingPriceSync } from "../services/shippingPriceService";

const OZON_BASE_URL = "https://api.ozonexpress.ma";
const OZON_CITIES_URL = "https://api.ozonexpress.ma/cities";
const PROVIDER_KEY = "ozon";

// ─── City Types & Cache ───────────────────────────────────────────────────────

export interface OzonCity {
  id: string;
  name: string;
}

// Global in-memory cache for the 801 cities
let ozonCitiesCache: Record<string, string> = {};
let isFetchingCities = false;

/**
 * Normalizes city strings for flawless matching
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Initializes and loads all 801 cities into memory. 
 * Call this during app startup or at the top of the processing pipeline.
 */
export async function initializeOzonCities(): Promise<void> {
  if (Object.keys(ozonCitiesCache).length > 0 || isFetchingCities) return;

  isFetchingCities = true;
  try {
    const response = await fetch('https://api.ozonexpress.ma/cities');
    if (!response.ok) throw new Error('Could not fetch Ozon cities');

    const json = await response.json();
    const citiesMap = json?.CITIES;
    if (!citiesMap || typeof citiesMap !== "object") {
      throw new Error("Unexpected cities response shape");
    }

    const cities: OzonCity[] = Object.values(citiesMap).map((c: any) => ({
      id: String(c.ID),
      name: c.NAME
    }));

    // Build the lookup dictionary dynamically
    const dynamicMap: Record<string, string> = {};

    const CITY_ALIASES: Record<string, string[]> = {
      casablanca: ["casa", "dar el beida", "dar lbeida", "dar el bayda"],
      rabat: ["rbat"],
      marrakech: ["marrakesh", "mrkch", "kech"],
      fes: ["fez", "fas"],
      tanger: ["tangier", "tanja"],
      tetouan: ["tetuan", "titwan"],
      meknes: ["meknas", "mknas"],
      oujda: ["wjda"],
      kenitra: ["knitra", "qnitra"],
      sale: ["sala"],
      nador: ["nadour"],
    };

    cities.forEach(city => {
      if (city.name && city.id) {
        const normalizedName = normalizeString(city.name);
        dynamicMap[normalizedName] = String(city.id);

        // Also map known aliases for this city
        for (const [canonical, aliases] of Object.entries(CITY_ALIASES)) {
          if (normalizedName.startsWith(canonical)) {
            for (const alias of aliases) {
              dynamicMap[alias] = String(city.id);
            }
          }
        }
      }
    });

    ozonCitiesCache = dynamicMap;
    console.log(`Successfully cached ${cities.length} Ozon Express cities.`);
  } catch (error) {
    console.error('Failed to initialize Ozon cities cache:', error);
  } finally {
    isFetchingCities = false;
  }
}

/**
 * Resolves any Moroccan city name against the 801 cached Ozon IDs instantly
 */
export async function getOzonCityId(cityName: string | null | undefined): Promise<string | null> {
  if (!cityName) return null;
  // NEW: if it's already a numeric ID, trust it and return as-is
  const trimmed = cityName.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  // Ensure cache is populated if it hasn't been already
  if (Object.keys(ozonCitiesCache).length === 0) {
    await initializeOzonCities();
  }

  const normalizedInput = normalizeString(cityName);

  // Instant O(1) exact match or alias match
  if (ozonCitiesCache[normalizedInput]) {
    return ozonCitiesCache[normalizedInput];
  }

  // Fallback to O(N) substring match if strict lookup fails
  for (const [cachedName, id] of Object.entries(ozonCitiesCache)) {
    if (cachedName.includes(normalizedInput) || normalizedInput.includes(cachedName)) {
      return id;
    }
  }

  console.warn(`[OzonService] No city match found for input: "${cityName}" (normalized: "${normalizedInput}")`);
  return null; // Return null if no match
}

/**
 * Formats and validates the delivery address for Ozon Express API.
 * Ensures the address meets the minimum length requirement (at least 5 characters).
 * Concatenates detailed address and city if available to guarantee sufficient length.
 */
export function formatOzonAddress(address?: string | null, city?: string | null): string {
  const rawAddress = (address ?? "").trim();
  const rawCity = (city ?? "").trim();

  if (!rawAddress && !rawCity) return "";

  if (rawAddress) {
    if (rawCity && !rawAddress.toLowerCase().includes(rawCity.toLowerCase())) {
      return `${rawAddress}, ${rawCity}`;
    }
    return rawAddress;
  }

  return rawCity;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds the multipart FormData from a typed parcel request object.
 * Skips undefined values so optional fields are omitted cleanly.
 */
function buildFormData(parcel: OzonParcelRequest): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(parcel)) {
    if (value !== undefined && value !== null) {
      let stringValue = String(value).trim();
      if (key === "parcel-phone") {
        stringValue = stringValue.replace(/\s+/g, "");
      }
      fd.append(key, stringValue);
    }
  }
  return fd;
}

/**
 * Constructs the full Ozon API URL for a given action.
 * Pattern: https://api.ozonexpress.ma/customers/{clientId}/{apiKey}/{action}
 */
function buildUrl(config: OzonConfig, action: string): string {
  const clientId = config.clientId?.trim() || "";
  const apiKey = config.apiKey?.trim() || "";
  const pathSegments = config.apiKeyFirst === false
    ? [apiKey, clientId]
    : [clientId, apiKey];
  return `${OZON_BASE_URL}/customers/${pathSegments.map(encodeURIComponent).join("/")}/${action}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a new parcel in Ozon Express.
 *
 * @param config       Ozon API credentials (clientId + apiKey)
 * @param parcelData   The parcel fields matching the Ozon form-data spec
 * @param workspaceId  Optional workspace ID for audit logging
 * @param orderId      Optional order ID for audit logging
 * @param orderNumber  Optional order number for audit logging
 */
export async function createOzonParcel(
  config: OzonConfig,
  parcelData: OzonParcelRequest,
  workspaceId?: string,
  orderId?: string,
  orderNumber?: string
): Promise<OzonResult<OzonParcelResponse>> {
  console.log("Dispatching to Ozon with ClientID:", config.clientId?.trim(), "Key:", config.apiKey?.trim() ? "PRESENT" : "MISSING");

  const validation = validateOzonConfig(config);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const parcelAddress = (parcelData["parcel-address"] ?? "").trim();
  if (parcelAddress.length < 5) {
    const errorMsg = `L'adresse du colis "${parcelAddress}" est trop courte (minimum 5 caractères requis pour Ozon Express).`;
    console.error("[OzonService] createOzonParcel address validation failed:", errorMsg);
    return { success: false, error: errorMsg };
  }

  try {
    const formData = buildFormData(parcelData);
    const clientId = config.clientId?.trim() || "";
    const apiKey = config.apiKey?.trim() || "";
    const proxyBase = import.meta.env.PROD ? `${SUPABASE_URL}/functions/v1/ozon-api` : "/api-ozon";
    const localUrl = `${proxyBase}/customers/${encodeURIComponent(clientId)}/${encodeURIComponent(apiKey)}/add-parcel`;
    const redactedUrl = localUrl.replace(encodeURIComponent(apiKey), "HIDDEN_KEY");
    console.log("[Ozon Dispatching via Local Proxy]:", redactedUrl);

    const headers: HeadersInit = import.meta.env.PROD
      ? {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "x-ecomos-order-id": orderId || "",
        "x-ecomos-workspace-id": workspaceId || ""
      }
      : {
        "x-ecomos-order-id": orderId || "",
        "x-ecomos-workspace-id": workspaceId || ""
      };

    const response = await fetch(localUrl, {
      method: "POST",
      headers,
      body: formData,
    });

    const rawText = await response.text();

    if (!response.ok) {
      const errorMsg = `Ozon API HTTP ${response.status}: ${rawText || response.statusText}`;
      return { success: false, error: errorMsg };
    }

    let data: OzonParcelResponse;
    try {
      data = JSON.parse(rawText);
    } catch {
      const parseError = `Invalid JSON from Ozon API: ${rawText.slice(0, 200)}`;
      return { success: false, error: parseError };
    }

    const addParcelResult = (data as any)?.["ADD-PARCEL"];
    const trackingNumber =
      addParcelResult?.["NEW-PARCEL"]?.["TRACKING-NUMBER"] ??
      addParcelResult?.["TRACKING-NUMBER"] ??
      (data as any)?.["TRACKING-NUMBER"] ??
      (data as any)?.["tracking_number"] ??
      (data as any)?.trackingNumber ??
      (data as any)?.["tracking-number"] ??
      (data as any)?.["TRACKING_NUMBER"] ??
      null;

    if (trackingNumber) {
      return {
        success: true,
        trackingNumber: String(trackingNumber),
        data,
      };
    }

    return {
      success: false,
      error: `No tracking number returned from Ozon Express: ${JSON.stringify(data).slice(0, 500)}`,
      data,
    };
  } catch (error: any) {
    const errorMsg = error?.message || "Network error contacting Ozon Express";
    console.error("[OzonService] createOzonParcel failed:", errorMsg);

    return { success: false, error: errorMsg };
  }
}

/**
 * Convenience: validate that an OzonConfig has the minimum required fields.
 * Call this before making API requests to fail fast with a clear message.
 */
export function validateOzonConfig(config: Partial<OzonConfig>): OzonResult {
  if (!config.clientId?.trim()) {
    return { success: false, error: "Ozon Client ID is required" };
  }
  if (!config.apiKey?.trim()) {
    return { success: false, error: "Ozon API Key is required" };
  }
  return { success: true };
}

/** Invalidate the in-memory city cache (useful after config changes). */
export function clearOzonCityCache(): void {
  ozonCitiesCache = {};
  isFetchingCities = false;
}

/**
 * Tracks one or more parcels in Ozon Express.
 *
 * @param config           Ozon API credentials (clientId + apiKey)
 * @param trackingNumbers  A single tracking number string or an array of tracking number strings
 */
export async function trackOzonParcel(
  config: OzonConfig,
  trackingNumbers: string | string[]
): Promise<OzonResult<OzonTrackingResponse>> {
  const validation = validateOzonConfig(config);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  try {
    const clientId = config.clientId?.trim() || "";
    const apiKey = config.apiKey?.trim() || "";
    const proxyBase = import.meta.env.PROD ? `${SUPABASE_URL}/functions/v1/ozon-api` : "/api-ozon";
    const localUrl = `${proxyBase}/customers/${encodeURIComponent(clientId)}/${encodeURIComponent(apiKey)}/tracking`;
    const redactedUrl = localUrl.replace(encodeURIComponent(apiKey), "HIDDEN_KEY");
    console.log("[Ozon Tracking via Local Proxy]:", redactedUrl);

    const headers: HeadersInit = import.meta.env.PROD ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {};

    let response: Response;
    if (Array.isArray(trackingNumbers)) {
      response = await fetch(localUrl, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ "tracking-number": trackingNumbers }),
      });
    } else {
      const formData = new FormData();
      formData.append("tracking-number", trackingNumbers);
      response = await fetch(localUrl, {
        method: "POST",
        headers,
        body: formData,
      });
    }

    const rawText = await response.text();

    if (!response.ok) {
      const errorMsg = `Ozon API HTTP ${response.status}: ${rawText || response.statusText}`;
      return { success: false, error: errorMsg };
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      const parseError = `Invalid JSON from Ozon API: ${rawText.slice(0, 200)}`;
      return { success: false, error: parseError };
    }

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    const errorMsg = error?.message || "Network error contacting Ozon Express";
    console.error("[OzonService] trackOzonParcel failed:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Retrieves detailed parcel information from Ozon Express.
 *
 * @param config          Ozon API credentials (clientId + apiKey)
 * @param trackingNumber  The tracking number of the parcel
 */
export async function getOzonParcelInfo(
  config: OzonConfig,
  trackingNumber: string
): Promise<OzonResult<OzonParcelResponse>> {
  const validation = validateOzonConfig(config);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  try {
    const clientId = config.clientId?.trim() || "";
    const apiKey = config.apiKey?.trim() || "";
    const proxyBase = import.meta.env.PROD ? `${SUPABASE_URL}/functions/v1/ozon-api` : "/api-ozon";
    const localUrl = `${proxyBase}/customers/${encodeURIComponent(clientId)}/${encodeURIComponent(apiKey)}/parcel-info`;
    const redactedUrl = localUrl.replace(encodeURIComponent(apiKey), "HIDDEN_KEY");
    console.log("[Ozon Parcel Info via Local Proxy]:", redactedUrl);

    const formData = new FormData();
    formData.append("tracking-number", trackingNumber);

    const headers: HeadersInit = import.meta.env.PROD ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {};

    const response = await fetch(localUrl, {
      method: "POST",
      headers,
      body: formData,
    });

    const rawText = await response.text();

    if (!response.ok) {
      const errorMsg = `Ozon API HTTP ${response.status}: ${rawText || response.statusText}`;
      return { success: false, error: errorMsg };
    }

    let data: OzonParcelResponse;
    try {
      data = JSON.parse(rawText);
    } catch {
      const parseError = `Invalid JSON from Ozon API: ${rawText.slice(0, 200)}`;
      return { success: false, error: parseError };
    }

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    const errorMsg = error?.message || "Network error contacting Ozon Express";
    console.error("[OzonService] getOzonParcelInfo failed:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Creates a delivery note for one or more tracking numbers in Ozon Express.
 * This orchestrates a 4-step flow:
 * a) POST /api-ozon/customers/{clientId}/{apiKey}/add-delivery-note (no body) -> returns a ref
 * b) POST /api-ozon/customers/{clientId}/{apiKey}/add-parcel-to-delivery-note (Ref, Codes[0]...)
 * c) POST /api-ozon/customers/{clientId}/{apiKey}/save-delivery-note (Ref)
 * d) Build PDF download URL
 *
 * @param config           Ozon API credentials (clientId + apiKey)
 * @param trackingNumbers  An array of tracking number strings
 */
export async function createOzonDeliveryNote(
  config: OzonConfig,
  trackingNumbers: string[]
): Promise<OzonDeliveryNoteResult> {
  const validation = validateOzonConfig(config);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const clientId = config.clientId?.trim() || "";
  const apiKey = config.apiKey?.trim() || "";
  const redactedKey = "HIDDEN_KEY";

  // Step a: Add Delivery Note
  let ref = "";
  try {
    const proxyBase = import.meta.env.PROD ? `${SUPABASE_URL}/functions/v1/ozon-api` : "/api-ozon";
    const localUrl = `${proxyBase}/customers/${encodeURIComponent(clientId)}/${encodeURIComponent(apiKey)}/add-delivery-note`;
    const redactedUrl = localUrl.replace(encodeURIComponent(apiKey), redactedKey);
    console.log("[Ozon Delivery Note Step 1/4 - Add Delivery Note]:", redactedUrl);

    const headers: HeadersInit = import.meta.env.PROD ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {};

    const response = await fetch(localUrl, {
      method: "POST",
      headers,
    });

    const rawText = await response.text();

    if (!response.ok) {
      const errorMsg = `Step 1 (add-delivery-note) failed - HTTP ${response.status}: ${rawText || response.statusText}`;
      return { success: false, error: errorMsg };
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      const parseError = `Step 1 (add-delivery-note) failed - Invalid JSON from Ozon API: ${rawText.slice(0, 200)}`;
      return { success: false, error: parseError };
    }

    const addBlData = data?.["ADD-BL"];
    if (addBlData?.RESULT !== "SUCCESS") {
      const errorMsg = `Step 1 (add-delivery-note) failed - ${addBlData?.MESSAGE || "Unknown error"}`;
      return { success: false, error: errorMsg };
    }

    const resolvedRef = addBlData?.["NEW-BL"]?.REF;
    if (!resolvedRef) {
      const errorMsg = `Step 1 (add-delivery-note) failed - No delivery note reference returned: ${rawText.slice(0, 500)}`;
      return { success: false, error: errorMsg };
    }
    ref = String(resolvedRef);
  } catch (error: any) {
    const errorMsg = `Step 1 (add-delivery-note) failed - ${error?.message || "Network error"}`;
    console.error("[OzonService] createOzonDeliveryNote step 1 failed:", errorMsg);
    return { success: false, error: errorMsg };
  }

  // Step b: Add Parcels to Delivery Note
  try {
    const proxyBase = import.meta.env.PROD ? `${SUPABASE_URL}/functions/v1/ozon-api` : "/api-ozon";
    const localUrl = `${proxyBase}/customers/${encodeURIComponent(clientId)}/${encodeURIComponent(apiKey)}/add-parcel-to-delivery-note`;
    const redactedUrl = localUrl.replace(encodeURIComponent(apiKey), redactedKey);
    console.log("[Ozon Delivery Note Step 2/4 - Add Parcels to Delivery Note]:", redactedUrl);

    const formData = new FormData();
    formData.append("Ref", ref);
    trackingNumbers.forEach((code, index) => {
      formData.append(`Codes[${index}]`, code);
    });

    console.log("[Ozon Delivery Note Step 2/4 - Request Parameters]:", { Ref: ref, Codes: trackingNumbers });

    const headers: HeadersInit = import.meta.env.PROD ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {};

    const response = await fetch(localUrl, {
      method: "POST",
      headers,
      body: formData,
    });

    const rawText = await response.text();

    if (!response.ok) {
      const errorMsg = `Step 2 (add-parcel-to-delivery-note) failed - HTTP ${response.status}: ${rawText || response.statusText}`;
      return { success: false, error: errorMsg };
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
      console.log("[Ozon Delivery Note Step 2/4 - Raw Response]:", data);
    } catch {
      const parseError = `Step 2 (add-parcel-to-delivery-note) failed - Invalid JSON from Ozon API: ${rawText.slice(0, 200)}`;
      return { success: false, error: parseError };
    }

    // Defensive check: if there's a nested object with RESULT === "ERROR" or similar, surface its MESSAGE
    const step2Key = Object.keys(data).find(k => k !== "CHECK_API" && typeof data[k] === "object");
    const step2Data = step2Key ? data[step2Key] : data;

    // Extract per-parcel error messages
    let parcelErrors: string[] = [];
    const parcels = step2Data?.PARCELS ?? step2Data?.parcels;
    if (parcels && typeof parcels === "object") {
      Object.entries(parcels).forEach(([code, val]: [string, any]) => {
        if (typeof val === "string") {
          if (!/success/i.test(val)) {
            parcelErrors.push(`${code}: ${val}`);
          }
        } else if (val && typeof val === "object") {
          if (val.RESULT === "ERROR" || val.result === "error" || val.status === "error" || val.error) {
            const msg = val.MESSAGE ?? val.message ?? val.error ?? "Unknown parcel error";
            parcelErrors.push(`${code}: ${msg}`);
          }
        }
      });
    }

    const summary = step2Data?.SUMMARY ?? step2Data?.summary;
    const errorsCount = Number(summary?.ERRORS ?? summary?.errors ?? summary?.ERROR ?? summary?.error ?? 0);
    const hasErrors = errorsCount > 0 || parcelErrors.length > 0;

    if (hasErrors || step2Data?.RESULT === "ERROR" || data.success === false || data.status === "error" || data.error) {
      const specificError = parcelErrors.length > 0 ? parcelErrors.join("; ") : (step2Data?.MESSAGE || data.error || "API error");
      const errorMsg = `Step 2 (add-parcel-to-delivery-note) failed - ${specificError}`;
      console.error(errorMsg, data);
      return { success: false, error: errorMsg };
    }

    console.log("[Ozon Delivery Note Step 2/4 - Step 2 Data (Success)]:", step2Data);
  } catch (error: any) {
    const errorMsg = `Step 2 (add-parcel-to-delivery-note) failed - ${error?.message || "Network error"}`;
    console.error("[OzonService] createOzonDeliveryNote step 2 failed:", errorMsg);
    return { success: false, error: errorMsg };
  }

  // Step c: Save Delivery Note
  try {
    const proxyBase = import.meta.env.PROD ? `${SUPABASE_URL}/functions/v1/ozon-api` : "/api-ozon";
    const localUrl = `${proxyBase}/customers/${encodeURIComponent(clientId)}/${encodeURIComponent(apiKey)}/save-delivery-note`;
    const redactedUrl = localUrl.replace(encodeURIComponent(apiKey), redactedKey);
    console.log("[Ozon Delivery Note Step 3/4 - Save Delivery Note]:", redactedUrl);

    const formData = new FormData();
    formData.append("Ref", ref);

    const headers: HeadersInit = import.meta.env.PROD ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {};

    const response = await fetch(localUrl, {
      method: "POST",
      headers,
      body: formData,
    });

    const rawText = await response.text();

    if (!response.ok) {
      const errorMsg = `Step 3 (save-delivery-note) failed - HTTP ${response.status}: ${rawText || response.statusText}`;
      return { success: false, error: errorMsg };
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
      console.log("[Ozon Delivery Note Step 3/4 - Raw Response]:", data);
    } catch {
      const parseError = `Step 3 (save-delivery-note) failed - Invalid JSON from Ozon API: ${rawText.slice(0, 200)}`;
      return { success: false, error: parseError };
    }

    // Defensive check
    const step3Key = Object.keys(data).find(k => k !== "CHECK_API" && typeof data[k] === "object");
    const step3Data = step3Key ? data[step3Key] : data;

    if (step3Data?.RESULT === "ERROR" || data.success === false || data.status === "error" || data.error) {
      const errorMsg = `Step 3 (save-delivery-note) failed - ${step3Data?.MESSAGE || data.error || "API error"}`;
      console.error(errorMsg, data);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    const errorMsg = `Step 3 (save-delivery-note) failed - ${error?.message || "Network error"}`;
    console.error("[OzonService] createOzonDeliveryNote step 3 failed:", errorMsg);
    return { success: false, error: errorMsg };
  }

  // Step d: Build PDF URL (direct link for top-level navigation / window.open)
  const pdfUrl = `https://client.ozoneexpress.ma/pdf-delivery-note?dn-ref=${encodeURIComponent(ref)}`;
  console.log("[Ozon Delivery Note Step 4/4 - Generated PDF URL]:", pdfUrl);

  return {
    success: true,
    ref,
    pdfUrl,
  };
}


/**
 * Creates a delivery note WITHOUT adding specific parcels (skips the add-parcel step).
 * Use this for the "Voir PDF" one-click flow when parcels are already registered
 * in Ozon's system — avoids "could not add" rejection errors.
 */
export async function createOzonDeliveryNoteOnly(
  config: OzonConfig
): Promise<OzonDeliveryNoteResult> {
  const validation = validateOzonConfig(config);
  if (!validation.success) return { success: false, error: validation.error };

  const clientId = config.clientId?.trim() || "";
  const apiKey = config.apiKey?.trim() || "";

  // Step 1: Create BL header
  let ref = "";
  try {
    const proxyBase = import.meta.env.PROD ? `${SUPABASE_URL}/functions/v1/ozon-api` : "/api-ozon";
    const url = `${proxyBase}/customers/${encodeURIComponent(clientId)}/${encodeURIComponent(apiKey)}/add-delivery-note`;
    const headers: HeadersInit = import.meta.env.PROD ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {};
    const response = await fetch(url, { method: "POST", headers });
    const rawText = await response.text();
    if (!response.ok) return { success: false, error: `add-delivery-note HTTP ${response.status}: ${rawText}` };
    let data: any;
    try { data = JSON.parse(rawText); } catch { return { success: false, error: `add-delivery-note invalid JSON: ${rawText.slice(0, 200)}` }; }
    const addBlData = data?.["ADD-BL"];
    if (addBlData?.RESULT !== "SUCCESS") return { success: false, error: `add-delivery-note failed: ${addBlData?.MESSAGE || "unknown error"}` };
    const resolvedRef = addBlData?.["NEW-BL"]?.REF;
    if (!resolvedRef) return { success: false, error: `add-delivery-note: no REF returned` };
    ref = String(resolvedRef);
  } catch (err: any) {
    return { success: false, error: `add-delivery-note: ${err?.message || "network error"}` };
  }

  // Step 2: Save BL (no parcels added)
  try {
    const proxyBase = import.meta.env.PROD ? `${SUPABASE_URL}/functions/v1/ozon-api` : "/api-ozon";
    const url = `${proxyBase}/customers/${encodeURIComponent(clientId)}/${encodeURIComponent(apiKey)}/save-delivery-note`;
    const fd = new FormData();
    fd.append("Ref", ref);
    const headers: HeadersInit = import.meta.env.PROD ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {};
    const response = await fetch(url, { method: "POST", headers, body: fd });
    const rawText = await response.text();
    if (!response.ok) return { success: false, error: `save-delivery-note HTTP ${response.status}: ${rawText}` };
    let data: any;
    try { data = JSON.parse(rawText); } catch { return { success: false, error: `save-delivery-note invalid JSON: ${rawText.slice(0, 200)}` }; }
    const k = Object.keys(data).find(key => key !== "CHECK_API" && typeof data[key] === "object");
    const d = k ? data[k] : data;
    if (d?.RESULT === "ERROR" || data.success === false || data.error) {
      return { success: false, error: `save-delivery-note failed: ${d?.MESSAGE || data.error || "unknown"}` };
    }
  } catch (err: any) {
    return { success: false, error: `save-delivery-note: ${err?.message || "network error"}` };
  }

  // Step 3: Build PDF URL (A4 labels)
  const pdfUrl = `https://client.ozoneexpress.ma/pdf-delivery-note-tickets?dn-ref=${encodeURIComponent(ref)}`;
  return { success: true, ref, pdfUrl };
}

