// Trigger Google Sheets sync via Edge Function using service role
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function triggerSync() {
  console.log('=== Triggering Google Sheets Sync (Service Role) ===\n');

  try {
    const { data, error } = await supabase.functions.invoke('sync-google-sheets-orders', {
      body: { workspace_id: '03826be0-e050-42d7-a030-a7d5a8d4f920' }
    });

    if (error) {
      console.error('Sync error:', error);
      // Try to get more details from context
      if (error.context) {
        console.error('Error context:', error.context);
      }
      return;
    }

    console.log('Sync result:', data);
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

triggerSync();