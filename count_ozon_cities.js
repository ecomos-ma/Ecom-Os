// Script to count Ozon cities in database
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

async function countCities() {
  try {
    console.log('Counting total cities in ozon_cities table...');
    
    const { count, error: countError } = await supabase
      .from('ozon_cities')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error counting cities:', countError);
      process.exit(1);
    }

    console.log(`\n✅ Total cities in database: ${count}`);

    // Get all cities to show sample
    const { data: allCities, error: fetchError } = await supabase
      .from('ozon_cities')
      .select('*')
      .order('name');

    if (fetchError) {
      console.error('Error fetching cities:', fetchError);
      process.exit(1);
    }

    console.log(`\n✅ Fetched ${allCities.length} cities from database`);
    
    // Show first 10 and last 10 cities
    console.log('\nFirst 10 cities:');
    allCities.slice(0, 10).forEach(city => {
      console.log(`  - ${city.name} (ID: ${city.id}, Ref: ${city.ref})`);
    });

    console.log('\nLast 10 cities:');
    allCities.slice(-10).forEach(city => {
      console.log(`  - ${city.name} (ID: ${city.id}, Ref: ${city.ref})`);
    });

  } catch (error) {
    console.error('Error during count:', error);
    process.exit(1);
  }
}

countCities();
