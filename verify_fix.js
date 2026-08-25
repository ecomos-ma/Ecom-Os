// Script to verify the fix - simulate the new query without LIMIT
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load env manually
const envContent = readFileSync('.env', 'utf-8');
const envLines = envContent.split('\n');
const env = {};
envLines.forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
);

async function verifyFix() {
  try {
    console.log('=== VERIFICATION DU FIX ===\n');
    
    // Simulate the NEW query (without LIMIT)
    console.log('Simulating NEW query (WITHOUT LIMIT)...');
    const { data: allCities, error: fetchError } = await supabase
      .from('ozon_cities')
      .select('*')
      .order('name');

    if (fetchError) {
      console.error('Error fetching cities:', fetchError);
      process.exit(1);
    }

    console.log(`✅ Cities fetched with NEW query: ${allCities.length} cities`);

    // Get total count
    const { count, error: countError } = await supabase
      .from('ozon_cities')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error counting cities:', countError);
      process.exit(1);
    }

    console.log(`✅ Total cities in database: ${count}`);

    console.log('\n=== COMPARAISON ===');
    console.log(`Avant fix (LIMIT 50): 50 villes affichées`);
    console.log(`Après fix (sans LIMIT): ${allCities.length} villes affichées`);
    console.log(`Total en base: ${count} villes`);
    
    if (allCities.length === count) {
      console.log('\n✅ SUCCÈS : Toutes les villes sont maintenant affichées !');
    } else {
      console.log(`\n⚠️ Attention : Il y a une différence de ${count - allCities.length} villes`);
    }

    // Show sample of cities that were previously missing
    console.log('\n=== Exemples de villes maintenant accessibles (qui étaient manquantes) ===');
    const previouslyMissing = allCities.slice(50, 65);
    previouslyMissing.forEach(city => {
      console.log(`  - ${city.name} (ID: ${city.id}, Ref: ${city.ref})`);
    });

  } catch (error) {
    console.error('Error during verification:', error);
    process.exit(1);
  }
}

verifyFix();
