// Script to identify which cities are missing due to LIMIT(50)
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

async function checkMissingCities() {
  try {
    console.log('Simulating current frontend query (LIMIT 50)...');
    
    const { data: limitedCities, error: limitedError } = await supabase
      .from('ozon_cities')
      .select('*')
      .order('name')
      .limit(50);

    if (limitedError) {
      console.error('Error fetching limited cities:', limitedError);
      process.exit(1);
    }

    console.log(`✅ Frontend would show: ${limitedCities.length} cities`);

    console.log('\nCities currently displayed (first 50):');
    limitedCities.forEach(city => {
      console.log(`  - ${city.name} (ID: ${city.id}, Ref: ${city.ref})`);
    });

    // Get all cities to show what's missing
    const { data: allCities, error: fetchError } = await supabase
      .from('ozon_cities')
      .select('*')
      .order('name');

    if (fetchError) {
      console.error('Error fetching all cities:', fetchError);
      process.exit(1);
    }

    console.log(`\n✅ Total in database: ${allCities.length} cities`);
    console.log(`❌ Missing cities: ${allCities.length - limitedCities.length} cities`);

    console.log('\nCities that are MISSING from the dropdown (after the first 50):');
    const missingCities = allCities.slice(50);
    missingCities.forEach(city => {
      console.log(`  - ${city.name} (ID: ${city.id}, Ref: ${city.ref})`);
    });

    console.log('\n=== SUMMARY ===');
    console.log(`Total cities in DB: ${allCities.length}`);
    console.log(`Cities displayed with LIMIT(50): ${limitedCities.length}`);
    console.log(`Cities NOT displayed: ${allCities.length - limitedCities.length}`);
    console.log(`Percentage displayed: ${((limitedCities.length / allCities.length) * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('Error during check:', error);
    process.exit(1);
  }
}

checkMissingCities();
