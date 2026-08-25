// Import Sendit cities into sendit_city_mappings table
// Run AFTER creating the table via Supabase SQL Editor.
// Usage: node scripts/import_sendit_cities.js

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const SENDIT_BASE_URL = "https://app.sendit.ma/api/v1";

// ─── STEP 1: Verify table is accessible ─────────────────────────────────────
console.log('🔍 Checking sendit_city_mappings table...');
const { error: tableCheckError } = await supabase
  .from('sendit_city_mappings')
  .select('sendit_city_id')
  .limit(1);

if (tableCheckError?.code === 'PGRST205') {
  console.error('❌ Table sendit_city_mappings does not exist.');
  console.error('');
  console.error('Please run this SQL in the Supabase Dashboard > SQL Editor first:');
  console.error('https://supabase.com/dashboard/project/wxfialbmyfkafobtkrde/sql/new');
  console.error('');
  console.error(`
CREATE TABLE IF NOT EXISTS public.sendit_city_mappings (
    sendit_city_id INTEGER NOT NULL,
    city_name TEXT NOT NULL,
    arabic_name TEXT,
    price NUMERIC,
    delais TEXT,
    is_pickup_city BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (sendit_city_id)
);

ALTER TABLE public.sendit_city_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access on sendit_city_mappings"
    ON public.sendit_city_mappings
    FOR SELECT TO authenticated USING (true);
  `);
  process.exit(1);
}
console.log('✅ Table is accessible.');

// ─── STEP 2: Authenticate with Sendit ───────────────────────────────────────
console.log('\n🔑 Fetching active Sendit integration from Supabase...');
const { data: integrations, error: intError } = await supabase
  .from('workspace_sendit_integrations')
  .select('public_key, secret_key')
  .eq('enabled', true)
  .not('public_key', 'is', null)
  .not('secret_key', 'is', null)
  .limit(1);

if (intError || !integrations || integrations.length === 0) {
  console.error("❌ No active Sendit integrations found in the database.");
  console.error("   At least one workspace must have Sendit connected in Settings > Integrations.");
  process.exit(1);
}

const { public_key, secret_key } = integrations[0];
console.log('   Found active integration.');

console.log('   Authenticating with Sendit API...');
const loginRes = await fetch(`${SENDIT_BASE_URL}/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ public_key, secret_key }),
});

const loginData = await loginRes.json();
if (!loginRes.ok || !loginData.success || !loginData.data?.token) {
  console.error("❌ Failed to authenticate with Sendit API:", JSON.stringify(loginData).slice(0, 300));
  process.exit(1);
}

const token = loginData.data.token;
const authHeaders = { Accept: "application/json", Authorization: `Bearer ${token}` };
console.log('✅ Authenticated with Sendit.');

// ─── STEP 3: Fetch all delivery districts ────────────────────────────────────
// Uses pickup-district=46 (Casablanca, the default) for price/delais data.
// NOTE: The city *list* from /districts is the same regardless of workspace
// or account - only price/delais vary per pickup-district. Using 46 gives
// typical Casablanca prices.
console.log('\n📦 Fetching delivery cities (pickup-district=46 / Casablanca)...');
let allDistricts = [];
let currentPage = 1;
let lastPage = 1;

do {
  const res = await fetch(`${SENDIT_BASE_URL}/districts?pickup-district=46&page=${currentPage}`, { headers: authHeaders });
  const data = await res.json();
  
  if (!res.ok || !data.success) {
    console.error(`  ⚠️ Failed on page ${currentPage}:`, JSON.stringify(data).slice(0, 200));
    break;
  }

  allDistricts.push(...(data.data || []));
  lastPage = data.last_page || 1;
  console.log(`  Page ${currentPage}/${lastPage}: ${(data.data||[]).length} cities (total: ${allDistricts.length})`);
  currentPage++;
} while (currentPage <= lastPage);

console.log(`✅ Total delivery cities fetched: ${allDistricts.length}`);

// ─── STEP 4: Fetch pickup cities ─────────────────────────────────────────────
console.log('\n🏙️  Fetching pickup cities...');
const pickupRes = await fetch(`${SENDIT_BASE_URL}/districts/pickup-cities`, { headers: authHeaders });
const pickupData = await pickupRes.json();
const pickupCities = pickupData.data || [];
const pickupCityIds = new Set(pickupCities.map(c => Number(c.id)));
console.log(`✅ Total pickup cities fetched: ${pickupCities.length}`);

// ─── STEP 5: Build unified records ───────────────────────────────────────────
const recordsMap = new Map();

for (const d of allDistricts) {
  const id = Number(d.id);
  if (isNaN(id) || id <= 0) continue;
  recordsMap.set(id, {
    sendit_city_id: id,
    city_name: d.name || d.ville || `City ${id}`,  // "name" is the clean name, not "ville" which is generic
    arabic_name: d.arabic_name || null,
    price: d.price != null ? parseFloat(d.price) : null,
    delais: d.delais || null,
    is_pickup_city: pickupCityIds.has(id),
    updated_at: new Date().toISOString()
  });
}

// Ensure pickup cities are in the map
for (const p of pickupCities) {
  const id = Number(p.id);
  if (isNaN(id) || id <= 0) continue;
  if (!recordsMap.has(id)) {
    recordsMap.set(id, {
      sendit_city_id: id,
      city_name: p.name,
      arabic_name: p.arabic_name || null,
      price: null,
      delais: null,
      is_pickup_city: true,
      updated_at: new Date().toISOString()
    });
  } else {
    recordsMap.get(id).is_pickup_city = true;
  }
}

const records = Array.from(recordsMap.values());
console.log(`\n📊 Total unique cities to upsert: ${records.length}`);

// ─── STEP 6: Upsert ──────────────────────────────────────────────────────────
console.log('⬆️  Upserting into sendit_city_mappings...');
const batchSize = 100;
let successCount = 0;
let errorCount = 0;

for (let i = 0; i < records.length; i += batchSize) {
  const batch = records.slice(i, i + batchSize);
  const { error } = await supabase
    .from('sendit_city_mappings')
    .upsert(batch, { onConflict: 'sendit_city_id' });
    
  if (error) {
    console.error(`  ❌ Batch error [${i}-${i + batch.length}]:`, error.message);
    errorCount += batch.length;
  } else {
    successCount += batch.length;
    process.stdout.write('.');
  }
}
console.log('\n');

// ─── STEP 7: Final count and samples ─────────────────────────────────────────
const { data: samples } = await supabase
  .from('sendit_city_mappings')
  .select('sendit_city_id,city_name,arabic_name,price,delais,is_pickup_city')
  .order('city_name')
  .limit(5);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ Import complete!`);
console.log(`   Processed: ${successCount} | Errors: ${errorCount}`);
console.log('\n📋 First 5 cities (alphabetical):');
if (samples) console.table(samples);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
