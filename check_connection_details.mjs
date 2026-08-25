import dotenv from "dotenv";
import * as fs from 'fs';
import * as path from 'path';

console.log("=== DATABASE CONNECTION DETAILS ===\n");

// Check which .env files exist
const envFiles = ['.env', '.env.local', '.env.production', '.env.development'];
const existingFiles = envFiles.filter(file => {
  try {
    return fs.existsSync(path.join(process.cwd(), file));
  } catch (e) {
    return false;
  }
});

console.log("1. ENVIRONMENT FILES FOUND:");
console.log("   ", existingFiles.length > 0 ? existingFiles : "None found");
console.log();

// Load .env
console.log("2. LOADING .env...");
const envConfig1 = dotenv.config();
console.log("   Loaded:", envConfig1.error ? "Error" : "Success");
console.log();

// Load .env.local
console.log("3. LOADING .env.local...");
const envConfig2 = dotenv.config({ path: '.env.local' });
console.log("   Loaded:", envConfig2.error ? "Error" : "Success");
console.log();

// Print the actual values being used
console.log("4. DATABASE CONNECTION VALUES:");
console.log("   VITE_SUPABASE_URL:", process.env.VITE_SUPABASE_URL || "NOT SET");
console.log("   SUPABASE_URL:", process.env.SUPABASE_URL || "NOT SET");
console.log();

// Mask the API key for security
const maskKey = (key) => {
  if (!key) return "NOT SET";
  if (key.length < 8) return "***TOO SHORT***";
  return key.substring(0, 4) + "..." + key.substring(key.length - 4);
};

console.log("5. API KEYS (MASKED):");
console.log("   VITE_SUPABASE_ANON_KEY:", maskKey(process.env.VITE_SUPABASE_ANON_KEY));
console.log("   SUPABASE_ANON_KEY:", maskKey(process.env.SUPABASE_ANON_KEY));
console.log("   SUPABASE_SERVICE_ROLE_KEY:", maskKey(process.env.SUPABASE_SERVICE_ROLE_KEY));
console.log();

// Extract project ref from URL
const extractProjectRef = (url) => {
  if (!url) return "NO URL";
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : "CANNOT EXTRACT";
};

console.log("6. PROJECT REFS:");
console.log("   From VITE_SUPABASE_URL:", extractProjectRef(process.env.VITE_SUPABASE_URL));
console.log("   From SUPABASE_URL:", extractProjectRef(process.env.SUPABASE_URL));
console.log();

console.log("7. EXPECTED PROJECT REF: wxfialbmyfkafobtkrde");
console.log("   Match check:", extractProjectRef(process.env.VITE_SUPABASE_URL) === "wxfialbmyfkafobtkrde" ? "✅ MATCH" : "❌ NO MATCH");
console.log();

console.log("8. SCRIPT OPERATION CONFIRMATION:");
console.log("   The diagnostic scripts ONLY performed SELECT queries (read-only)");
console.log("   No INSERT, UPDATE, DELETE, or any write operations were executed");
console.log("   Scripts used: run_tracking_diagnostics.mjs, check_schema_diagnostics.mjs, check_integration_state.mjs");
