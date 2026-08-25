// Check if Google Sheets credentials have field mappings configured
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

async function checkMappings() {
  console.log('=== Checking Google Sheets Mappings ===\n');

  try {
    const { data: credentials, error } = await supabase
      .from('google_sheets_credentials')
      .select('workspace_id, sheet_url, web_app_url, field_mappings, custom_status_mappings, mapping_version')
      .limit(10);

    if (error) {
      console.error('Error fetching credentials:', error);
      return;
    }

    if (!credentials || credentials.length === 0) {
      console.log('No Google Sheets credentials found');
      return;
    }

    console.log(`Found ${credentials.length} Google Sheets integration(s):\n`);

    credentials.forEach((cred, index) => {
      console.log(`--- Integration ${index + 1} ---`);
      console.log(`Workspace ID: ${cred.workspace_id}`);
      console.log(`Sheet URL: ${cred.sheet_url}`);
      console.log(`Web App URL: ${cred.web_app_url}`);
      console.log(`Mapping Version: ${cred.mapping_version}`);
      
      if (cred.field_mappings && Array.isArray(cred.field_mappings)) {
        console.log(`Field Mappings (${cred.field_mappings.length}):`);
        cred.field_mappings.forEach(m => {
          console.log(`  "${m.sheetHeader}" -> "${m.destinationField}" (${m.confidence})`);
        });
      } else {
        console.log('Field Mappings: NONE (will use fallback)');
      }
      
      if (cred.custom_status_mappings) {
        console.log('Custom Status Mappings:', JSON.stringify(cred.custom_status_mappings, null, 2));
      } else {
        console.log('Custom Status Mappings: NONE');
      }
      console.log('');
    });

  } catch (error) {
    console.error('Check failed:', error);
  }
}

checkMappings();