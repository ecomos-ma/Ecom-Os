// Script to import Ozon cities from Excel to Supabase
import XLSX from 'xlsx';
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

async function importOzonCities() {
  try {
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile('c:\\Users\\Mac\\Downloads\\cities_pricing7.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`Found ${data.length} cities in Excel file`);

    // Transform data to match ozon_cities table structure
    const cities = data.map((row) => ({
      id: row['ID'],
      ref: row['Code (REF)'],
      name: row['City Name'],
      delivered_price: row['Delivered Price (DH)'],
      returned_price: row['Returned Price (DH)'],
      refused_price: row['Refused Price (DH)'],
    }));

    console.log('Sample cities (first 5):');
    console.log(JSON.stringify(cities.slice(0, 5), null, 2));

    // Clear existing data (optional - comment out if you want to append)
    console.log('Clearing existing ozon_cities data...');
    const { error: deleteError } = await supabase
      .from('ozon_cities')
      .delete()
      .neq('id', 0); // Delete all rows

    if (deleteError) {
      console.error('Error clearing existing data:', deleteError);
    } else {
      console.log('Existing data cleared');
    }

    // Insert in batches of 100
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < cities.length; i += batchSize) {
      const batch = cities.slice(i, i + batchSize);
      console.log(`Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cities.length / batchSize)} (${batch.length} cities)...`);

      const { error } = await supabase
        .from('ozon_cities')
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error);
        console.error('Failed batch sample:', batch.slice(0, 3));
      } else {
        insertedCount += batch.length;
        console.log(`✓ Batch ${Math.floor(i / batchSize) + 1} inserted successfully`);
      }
    }

    console.log(`\n✅ Import complete! ${insertedCount}/${cities.length} cities imported`);

    // Verify the import
    const { count, error: countError } = await supabase
      .from('ozon_cities')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error counting cities:', countError);
    } else {
      console.log(`Total cities in database: ${count}`);
    }

    // Show sample cities from database
    const { data: sampleCities, error: sampleError } = await supabase
      .from('ozon_cities')
      .select('*')
      .limit(5);

    if (sampleError) {
      console.error('Error fetching sample cities:', sampleError);
    } else {
      console.log('\nSample cities from database:');
      console.log(JSON.stringify(sampleCities, null, 2));
    }

  } catch (error) {
    console.error('Error during import:', error);
    process.exit(1);
  }
}

importOzonCities();
