import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const csvPath = path.resolve(__dirname, '../ameex_cities_import.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');

const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
const headers = lines[0].split(',');

const parseExtraFee = (feeStr) => {
  if (!feeStr) return null;
  const num = parseFloat(feeStr.replace('+', '').trim());
  return isNaN(num) ? null : num;
};

const parseBool = (boolStr) => {
  return boolStr.trim().toLowerCase() === 'oui';
};

const records = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  // Simple CSV parse handling commas
  const values = line.split(',');
  if (values.length < 14) continue;
  
  const id = parseInt(values[0].trim(), 10);
  const name = values[1].trim();
  const feeStr = values[2].trim();
  const baseFee = parseFloat(feeStr);
  const extraMed = parseExtraFee(values[3]);
  const extraHvy = parseExtraFee(values[4]);
  const extraBlk = parseExtraFee(values[5]);
  const extraOvs = parseExtraFee(values[6]);
  
  const mon = parseBool(values[7]);
  const tue = parseBool(values[8]);
  const wed = parseBool(values[9]);
  const thu = parseBool(values[10]);
  const fri = parseBool(values[11]);
  const sat = parseBool(values[12]);
  const sun = parseBool(values[13]);
  const notes = values[14] ? values[14].trim() : null;

  records.push({
    ameex_city_id: id,
    display_name: name,
    normalized_city: name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""),
    base_fee: isNaN(baseFee) ? null : baseFee,
    extra_fee_med: extraMed,
    extra_fee_hvy: extraHvy,
    extra_fee_blk: extraBlk,
    extra_fee_ovs: extraOvs,
    available_monday: mon,
    available_tuesday: tue,
    available_wednesday: wed,
    available_thursday: thu,
    available_friday: fri,
    available_saturday: sat,
    available_sunday: sun,
    notes: notes,
    updated_at: new Date().toISOString()
  });
}

console.log(`Parsed ${records.length} records from CSV.`);

async function importData() {
  let successCount = 0;
  let errorCount = 0;

  console.log('Starting UPSERT into ameex_city_mappings...');
  
  // Upsert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .from('ameex_city_mappings')
      .upsert(batch, { onConflict: 'ameex_city_id' });
      
    if (error) {
      console.error(`Error inserting batch ${i}:`, error);
      errorCount += batch.length;
    } else {
      successCount += batch.length;
    }
  }

  console.log(`Import finished.`);
  console.log(`Successfully processed: ${successCount} cities.`);
  if (errorCount > 0) {
    console.error(`Failed to process: ${errorCount} cities.`);
  }

  // Count total cities in table
  const { count, error } = await supabase
    .from('ameex_city_mappings')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error counting total cities:', error);
  } else {
    console.log(`Total cities in ameex_city_mappings table: ${count}`);
  }
}

importData().catch(console.error);
