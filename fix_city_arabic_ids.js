// Script to fix incorrect city IDs in city_arabic_names
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

// Corrections to apply
const CORRECTIONS = [
  { oldId: 2047, newId: 217, city: 'Nador' },
  { oldId: 1622, newId: 345, city: 'Mohammedia' },
  { oldId: 1922, newId: 1872, city: 'Taza' },
  { oldId: 1832, newId: 1830, city: 'Laayoune' },
  { oldId: 2146, newId: 103, city: 'Dakhla' },
  { oldId: 2178, newId: 2174, city: 'Casablanca' },
];

async function fixCityArabicIds() {
  try {
    console.log('Fixing incorrect city IDs in city_arabic_names...');

    for (const correction of CORRECTIONS) {
      console.log(`\nUpdating ${correction.city}: ${correction.oldId} → ${correction.newId}`);

      const { error } = await supabase
        .from('city_arabic_names')
        .update({ ozon_city_id: correction.newId })
        .eq('ozon_city_id', correction.oldId);

      if (error) {
        console.error(`Error updating ${correction.city}:`, error);
      } else {
        const { count } = await supabase
          .from('city_arabic_names')
          .select('*', { count: 'exact', head: true })
          .eq('ozon_city_id', correction.newId);

        console.log(`✓ Updated ${count} entries for ${correction.city}`);
      }
    }

    console.log('\n✅ All corrections applied');

  } catch (error) {
    console.error('Error during fix:', error);
    process.exit(1);
  }
}

fixCityArabicIds();
