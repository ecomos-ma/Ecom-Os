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

async function testFunctionCall() {
  console.log("Testing function call with invalid ID to see error...");
  
  const { data, error } = await supabase
    .rpc('accept_workspace_invitation', { p_invitation_id: '00000000-0000-0000-0000-000000000000' });
  
  console.log("Error:", error);
  
  if (error && error.message === 'INVITATION_NOT_FOUND') {
    console.log("✅ Function exists and is callable");
    console.log("✅ Error suggests function is working (invitation not found is expected)");
  } else if (error && error.message === 'SUBSCRIPTION_READ_NOT_AUTHORIZED') {
    console.log("❌ Function still has RLS issue - fix not applied");
  } else {
    console.log("Function call result:", data);
  }
}

testFunctionCall();
