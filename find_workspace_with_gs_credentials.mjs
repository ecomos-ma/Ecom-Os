// Find workspaces with Google Sheets credentials
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

async function findWorkspacesWithGSCredentials() {
  console.log('=== Finding Workspaces with Google Sheets Credentials ===\n');

  try {
    const { data: credentials, error } = await supabase
      .from('google_sheets_credentials')
      .select('workspace_id, web_app_url, sheet_url')
      .not('web_app_url', 'is', null);

    if (error) {
      console.error('Error fetching credentials:', error.message);
      return;
    }

    if (!credentials || credentials.length === 0) {
      console.log('No workspaces with Google Sheets credentials found');
      return;
    }

    console.log(`Found ${credentials.length} workspace(s) with Google Sheets credentials:`);

    for (const cred of credentials) {
      const { data: workspace, error: wsError } = await supabase
        .from('workspaces')
        .select('id, name')
        .eq('id', cred.workspace_id)
        .single();

      if (wsError) {
        console.log(`- ${cred.workspace_id} (workspace name not found)`);
      } else {
        console.log(`- ${workspace.name} (${workspace.id})`);
        console.log(`  Web App URL: ${cred.web_app_url}`);
      }

      // Count existing Google Sheets orders
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('order_number')
        .eq('workspace_id', cred.workspace_id)
        .eq('source', 'sheets');

      if (ordersError) {
        console.log(`  Orders count: error (${ordersError.message})`);
      } else {
        console.log(`  Existing GS orders: ${orders?.length || 0}`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

findWorkspacesWithGSCredentials();