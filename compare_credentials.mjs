import dotenv from "dotenv";
dotenv.config();

console.log("=== CREDENTIAL COMPARISON: FRONTEND VS .ENV ===\n");

// Mask the API key for security
const maskKey = (key) => {
  if (!key) return "NOT SET";
  if (key.length < 8) return "***TOO SHORT***";
  return key.substring(0, 4) + "..." + key.substring(key.length - 4);
};

console.log("1. .ENV FILE VALUES:");
console.log("   VITE_SUPABASE_URL:", process.env.VITE_SUPABASE_URL || "NOT SET");
console.log("   VITE_SUPABASE_ANON_KEY:", maskKey(process.env.VITE_SUPABASE_ANON_KEY));
console.log("   SUPABASE_SERVICE_ROLE_KEY:", maskKey(process.env.SUPABASE_SERVICE_ROLE_KEY));
console.log();

console.log("2. FRONTEND USES (src/lib/supabase.ts):");
console.log("   import.meta.env.VITE_SUPABASE_URL");
console.log("   import.meta.env.VITE_SUPABASE_ANON_KEY");
console.log();

console.log("3. ENV VARIABLE NAME MATCH:");
const urlMatch = process.env.VITE_SUPABASE_URL ? "✅ MATCH" : "❌ NO MATCH";
const keyMatch = process.env.VITE_SUPABASE_ANON_KEY ? "✅ MATCH" : "❌ NO MATCH";
console.log("   VITE_SUPABASE_URL:", urlMatch);
console.log("   VITE_SUPABASE_ANON_KEY:", keyMatch);
console.log();

console.log("4. PROJECT REF EXTRACTION:");
const extractProjectRef = (url) => {
  if (!url) return "NO URL";
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : "CANNOT EXTRACT";
};

const projectRef = extractProjectRef(process.env.VITE_SUPABASE_URL);
console.log("   Project ref from URL:", projectRef);
console.log("   Expected: wxfialbmyfkafobtkrde");
console.log("   Match:", projectRef === "wxfialbmyfkafobtkrde" ? "✅ YES" : "❌ NO");
console.log();

console.log("5. FULL URL COMPARISON:");
console.log("   .env URL:", process.env.VITE_SUPABASE_URL);
console.log("   Frontend should use: same as above (via import.meta.env)");
console.log();

console.log("6. KEY COMPARISON (FULL MASKED):");
console.log("   .env ANON key:", maskKey(process.env.VITE_SUPABASE_ANON_KEY));
console.log("   Frontend should use: same as above (via import.meta.env)");
console.log();

console.log("=== ANALYSIS ===");
console.log("If frontend and .env use the same variable names, they should be identical.");
console.log("The only difference would be if:");
console.log("1. Frontend is hardcoded with different values");
console.log("2. Build process uses different .env file");
console.log("3. Runtime environment overrides these values");
console.log("4. Frontend is using production values while .env has dev/staging values");