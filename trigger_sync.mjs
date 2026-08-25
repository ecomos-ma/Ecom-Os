// Trigger Google Sheets sync via Edge Function
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function triggerSync() {
  console.log('=== Triggering Google Sheets Sync ===\n');

  try {
    const { data, error } = await supabase.functions.invoke('sync-google-sheets-orders', {
      body: { workspace_id: '03826be0-e050-42d7-a030-a7d5a8d4f920' }
    });

    if (error) {
      console.error('Sync error:', error);
      return;
    }

    console.log('Sync result:', data);
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

triggerSync();