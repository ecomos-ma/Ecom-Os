import * as fs from 'fs';
import * as path from 'path';

console.log("=== CHECKING APP ENVIRONMENT CONFIGURATION ===\n");

// Check what the React app typically uses
console.log("1. CHECKING TYPICAL REACT ENV VARIABLE NAMES...");
const reactEnvVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY', 
  'REACT_APP_SUPABASE_URL',
  'REACT_APP_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY'
];

reactEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`   ${varName}: SET`);
    if (varName.includes('URL')) {
      console.log(`      → ${value}`);
    }
  } else {
    console.log(`   ${varName}: NOT SET`);
  }
});

console.log("\n2. CHECKING VITE CONFIG...");
try {
  const viteConfig = fs.readFileSync('vite.config.js', 'utf8');
  console.log("   vite.config.js exists: YES");
  // Check if there's any proxy or environment configuration
  if (viteConfig.includes('proxy') || viteConfig.includes('define')) {
    console.log("   ⚠️  Contains proxy/define configuration");
  }
} catch (e) {
  console.log("   vite.config.js: NOT FOUND or ERROR");
}

console.log("\n3. CHECKING REACT APP SOURCE FOR SUPABASE CONFIG...");
try {
  const supabaseLib = fs.readFileSync('src/lib/supabase.ts', 'utf8');
  console.log("   src/lib/supabase.ts exists: YES");
  
  // Extract the URL being used
  const urlMatch = supabaseLib.match(/supabaseUrl\s*[:=]\s*['"`]([^'"`]+)['"`]/);
  if (urlMatch) {
    console.log(`   URL in code: ${urlMatch[1]}`);
  }
  
  const keyMatch = supabaseLib.match(/supabaseAnonKey\s*[:=]\s*['"`]([^'"`]+)['"`]/);
  if (keyMatch) {
    console.log(`   Anon key in code: ${keyMatch[1].substring(0, 10)}...`);
  }
} catch (e) {
  console.log("   src/lib/supabase.ts: NOT FOUND or ERROR");
}

console.log("\n4. COMPARISON ANALYSIS...");
console.log("   Our diagnostic script used:");
console.log(`   - URL: ${process.env.VITE_SUPABASE_URL}`);
console.log(`   - Service Role Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'}`);
console.log();
console.log("   The React app might be using different variables or hardcoded values.");
console.log("   This could explain why the app shows data but our scripts don't.");