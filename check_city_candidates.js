// Script to check city candidates for ambiguous Arabic name mappings
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

const cities = ['casablanca', 'nador', 'mohammedia', 'taza', 'laayoune', 'ouarzazate', 'dakhla'];

async function checkCandidates() {
  for (const city of cities) {
    const { data } = await supabase
      .from('ozon_cities')
      .select('id, ref, name, delivered_price')
      .ilike('name', `%${city}%`)
      .order('delivered_price', { ascending: true });

    console.log(`\n=== ${city.toUpperCase()} ===`);
    console.log(JSON.stringify(data, null, 2));
  }
}

checkCandidates();
