import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInvitationRead() {
  console.log("Testing invitation read with service role...");
  
  const { data, error } = await supabase
    .from('workspace_invitations')
    .select('*')
    .eq('id', '6331a513-ebad-4220-b1b1-9a3551c5a66b')
    .single();

  if (error) {
    console.error("Error reading invitation:", error);
    return;
  }

  console.log("Invitation data:", data);
  
  // Check if we can read subscription tables with service role
  const { data: subData, error: subError } = await supabase
    .from('workspace_subscription_owners')
    .select('*')
    .eq('workspace_id', data.workspace_id)
    .maybeSingle();

  if (subError) {
    console.error("Error reading subscription data:", subError);
  } else {
    console.log("Subscription data:", subData);
  }
}

testInvitationRead();
