import { supabase } from "./supabase";

export interface LegalAcceptanceRecord {
  terms_version: string;
  privacy_version: string;
  accepted_at?: string;
}

const CURRENT_VERSIONS = {
  terms: "1.0",
  privacy: "1.0",
};

/**
 * Record legal acceptance when a user signs up
 */
export async function recordLegalAcceptance(
  userId: string,
  source: "signup" | "settings" | "oauth" = "signup"
) {
  try {
    // Get client IP and user agent
    const userAgent = navigator.userAgent;
    let ipAddress = "unknown";

    // Try to get IP from a public API (optional, may not work everywhere)
    try {
      const response = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(2000) });
      const data = await response.json() as { ip: string };
      ipAddress = data.ip;
    } catch {
      // IP fetch failed, use default
    }

    const { error } = await supabase.from("legal_acceptance").insert({
      user_id: userId,
      terms_version: CURRENT_VERSIONS.terms,
      privacy_version: CURRENT_VERSIONS.privacy,
      acceptance_source: source,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // 404 errors mean table doesn't exist yet (migrations not run) - this is ok
    if (error && error.code === "404") {
      console.warn("[legalService] legal_acceptance table not found - migrations may not be applied yet");
      return { success: false, error: "table_missing", message: "Migrations not yet applied" };
    }
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.warn("[legalService] Failed to record legal acceptance:", error);
    return { success: false, error };
  }
}

/**
 * Get the latest legal acceptance for a user
 */
export async function getLatestLegalAcceptance(userId: string) {
  try {
    const { data, error } = await supabase
      .from("legal_acceptance")
      .select("*")
      .eq("user_id", userId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .single();

    // 404 errors mean table doesn't exist - return null gracefully
    if (error && error.code === "404") {
      return null;
    }
    if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
    return data || null;
  } catch (error) {
    console.warn("[legalService] Failed to fetch legal acceptance:", error);
    return null;
  }
}

/**
 * Check if user has accepted current versions
 */
export async function hasAcceptedCurrentVersions(userId: string): Promise<boolean> {
  const record = await getLatestLegalAcceptance(userId);
  if (!record) return false;
  return (
    record.terms_version === CURRENT_VERSIONS.terms &&
    record.privacy_version === CURRENT_VERSIONS.privacy
  );
}

/**
 * Get acceptance versions from profile
 */
export async function getAcceptanceVersionsFromProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("terms_version_accepted, privacy_version_accepted, last_terms_acceptance, last_privacy_acceptance")
      .eq("id", userId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Failed to fetch profile acceptance versions:", error);
    return null;
  }
}

/**
 * Get all legal acceptance records for a user (for admin audit)
 */
export async function getAllLegalAcceptanceRecords(userId: string) {
  try {
    const { data, error } = await supabase
      .from("legal_acceptance")
      .select("*")
      .eq("user_id", userId)
      .order("accepted_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Failed to fetch legal acceptance records:", error);
    return [];
  }
}
