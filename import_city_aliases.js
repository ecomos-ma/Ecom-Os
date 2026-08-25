// Script to import common Moroccan city aliases
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
  env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
);

// Common Moroccan city aliases mapping
// Format: alias -> ozon_city_id (we'll need to look up the IDs from ozon_cities)
const CITY_ALIASES = [
  // Casablanca
  { alias: 'casa', cityRef: 'CT' }, // Main Casablanca
  { alias: 'dar el beida', cityRef: 'CT' },
  { alias: 'dar lbeida', cityRef: 'CT' },
  { alias: 'dar el bayda', cityRef: 'CT' },
  
  // Rabat
  { alias: 'rbat', cityRef: 'RAB' },
  
  // Marrakech
  { alias: 'kech', cityRef: 'MRK' },
  { alias: 'mrkch', cityRef: 'MRK' },
  { alias: 'marrakesh', cityRef: 'MRK' },
  
  // Fes
  { alias: 'fez', cityRef: 'FES' },
  { alias: 'fas', cityRef: 'FES' },
  
  // Tanger
  { alias: 'tanja', cityRef: 'TNG' },
  { alias: 'tangier', cityRef: 'TNG' },
  
  // Tetouan
  { alias: 'tetuan', cityRef: 'TTN' },
  { alias: 'titwan', cityRef: 'TTN' },
  
  // Meknes
  { alias: 'meknas', cityRef: 'MKN' },
  { alias: 'mknas', cityRef: 'MKN' },
  
  // Oujda
  { alias: 'wjda', cityRef: 'OUJ' },
  
  // Kenitra
  { alias: 'knitra', cityRef: 'KNT' },
  { alias: 'qnitra', cityRef: 'KNT' },
  
  // Sale
  { alias: 'sala', cityRef: 'SL' },
  
  // Nador
  { alias: 'nadour', cityRef: 'NAD' },
  
  // Agadir (already direct, but add common variations)
  { alias: 'agadir', cityRef: 'AGA' },
  
  // Essaouira
  { alias: 'souira', cityRef: 'ES' },
  
  // Ouarzazate
  { alias: 'ouarzazate', cityRef: 'OUZ' },
  { alias: 'warzazat', cityRef: 'OUZ' },
  
  // Beni Mellal
  { alias: 'beni mellal', cityRef: 'BM' },
  { alias: 'bm', cityRef: 'BM' },
  
  // Safi
  { alias: 'safi', cityRef: 'SAF' },
  
  // El Jadida
  { alias: 'jadida', cityRef: 'JD' },
  { alias: 'el jadida', cityRef: 'JD' },
  { alias: 'mazagan', cityRef: 'JD' },
  
  // Settat
  { alias: 'settat', cityRef: 'SET' },
  
  // Mohammedia
  { alias: 'mohammedia', cityRef: 'MED' },
  { alias: 'fédala', cityRef: 'MED' },
  
  // Ksar el Kebir
  { alias: 'ksar', cityRef: 'KSK' },
  { alias: 'ksar el kebir', cityRef: 'KSK' },
];

async function importCityAliases() {
  try {
    console.log('Importing city aliases...');

    // Clear existing aliases
    console.log('Clearing existing city_aliases...');
    const { error: deleteError } = await supabase
      .from('city_aliases')
      .delete()
      .neq('id', 0);

    if (deleteError) {
      console.error('Error clearing existing aliases:', deleteError);
    } else {
      console.log('Existing aliases cleared');
    }

    // Get ozon_city_id for each city_ref
    const uniqueRefs = [...new Set(CITY_ALIASES.map(a => a.cityRef))];
    console.log(`Looking up ${uniqueRefs.length} unique city refs...`);

    const { data: cities, error: citiesError } = await supabase
      .from('ozon_cities')
      .select('id, ref')
      .in('ref', uniqueRefs);

    if (citiesError) {
      throw citiesError;
    }

    console.log(`Found ${cities.length} cities in database`);

    // Create a map of ref -> id
    const refToId = {};
    cities.forEach(city => {
      refToId[city.ref.toLowerCase()] = city.id;
    });

    // Prepare aliases with their ozon_city_id
    const aliasesToInsert = [];
    const notFound = [];

    CITY_ALIASES.forEach(({ alias, cityRef }) => {
      const cityId = refToId[cityRef.toLowerCase()];
      if (cityId) {
        aliasesToInsert.push({
          ozon_city_id: cityId,
          alias: alias.toLowerCase()
        });
      } else {
        notFound.push({ alias, cityRef });
      }
    });

    console.log(`Prepared ${aliasesToInsert.length} aliases to insert`);
    if (notFound.length > 0) {
      console.log('Warning: City refs not found:', notFound);
    }

    // Insert in batches
    const batchSize = 50;
    let insertedCount = 0;

    for (let i = 0; i < aliasesToInsert.length; i += batchSize) {
      const batch = aliasesToInsert.slice(i, i + batchSize);
      console.log(`Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(aliasesToInsert.length / batchSize)} (${batch.length} aliases)...`);

      const { error } = await supabase
        .from('city_aliases')
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error);
      } else {
        insertedCount += batch.length;
        console.log(`✓ Batch ${Math.floor(i / batchSize) + 1} inserted successfully`);
      }
    }

    console.log(`\n✅ Import complete! ${insertedCount}/${aliasesToInsert.length} aliases imported`);

    // Show sample aliases
    const { data: sampleAliases, error: sampleError } = await supabase
      .from('city_aliases')
      .select(`
        alias,
        ozon_cities (
          name,
          ref
        )
      `)
      .limit(10);

    if (sampleError) {
      console.error('Error fetching sample aliases:', sampleError);
    } else {
      console.log('\nSample aliases from database:');
      console.log(JSON.stringify(sampleAliases, null, 2));
    }

    // Test search for "casa"
    console.log('\n🔍 Testing search for "casa"...');
    const { data: casaResults, error: casaError } = await supabase
      .from('city_aliases')
      .select(`
        alias,
        ozon_cities (
          id,
          name,
          ref,
          delivered_price
        )
      `)
      .ilike('alias', '%casa%');

    if (casaError) {
      console.error('Error searching for casa:', casaError);
    } else {
      console.log('Results for "casa":');
      console.log(JSON.stringify(casaResults, null, 2));
    }

  } catch (error) {
    console.error('Error during import:', error);
    process.exit(1);
  }
}

importCityAliases();
