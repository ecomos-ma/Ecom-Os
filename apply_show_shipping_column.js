// Script to apply show_shipping_column migration
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

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

async function applyMigration() {
  try {
    console.log('Applying show_shipping_column migration...\n');

    const { error } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS show_shipping_column BOOLEAN DEFAULT FALSE;'
    });

    if (error) {
      console.error('Error applying migration:', error.message);
      console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
      console.log('ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS show_shipping_column BOOLEAN DEFAULT FALSE;');
      process.exit(1);
    }

    console.log('✓ Migration applied successfully');
    console.log('show_shipping_column added to workspaces table with default FALSE');

  } catch (error) {
    console.error('Error:', error.message);
    console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
    console.log('ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS show_shipping_column BOOLEAN DEFAULT FALSE;');
    process.exit(1);
  }
}

applyMigration();
