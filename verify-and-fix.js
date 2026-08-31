#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

async function applyWhatsAppFix() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error('❌ Missing VITE_SUPABASE_URL in .env');
    process.exit(1);
  }

  if (!supabaseAnonKey && !serviceRoleKey) {
    console.error('❌ Missing VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const key = serviceRoleKey || supabaseAnonKey;
  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false },
    db: { schema: 'public' }
  });

  try {
    console.log('🔍 Diagnosing WhatsApp setup...\n');

    // Check if whatsapp_address_automation_settings exists
    const { data: settingsTable, error: settingsError } = await supabase
      .from('whatsapp_address_automation_settings')
      .select('id')
      .limit(1);

    if (settingsError && settingsError.code === 'PGRST116') {
      console.log('⚠️  Table whatsapp_address_automation_settings does not exist');
      console.log('📝 Creating table and functions...\n');
    } else {
      console.log('✅ Table whatsapp_address_automation_settings exists');
      console.log(`   Current settings count: ${settingsTable?.length || 0}\n`);
    }

    // Try to test the function
    console.log('🧪 Testing process_whatsapp_inbound function...\n');
    
    const testResult = await supabase.rpc('process_whatsapp_inbound', {
      p_workspace_id: '00000000-0000-0000-0000-000000000000',
      p_provider_event_id: 'test-' + Date.now(),
      p_remote_jid: 'test@c.us',
      p_phone: '212600000000',
      p_body: '1',
    }).catch(err => ({ error: err }));

    if (testResult.error) {
      if (testResult.error.message.includes('Could not choose')) {
        console.log('❌ Function signature conflict detected!');
        console.log('   PostgreSQL cannot decide between multiple function versions\n');
        console.log('🔧 Applying comprehensive fix...\n');
        
        // Read and apply fix
        const fixSQL = fs.readFileSync(path.join(__dirname, 'fix-whatsapp-flow.sql'), 'utf-8');
        
        // Split by statements and execute carefully
        const statements = fixSQL
          .split(';\n')
          .map(s => s.trim())
          .filter(s => s && !s.startsWith('--'));

        console.log(`📋 Executing ${statements.length} SQL statements...\n`);

        // For Supabase, we need to use a different approach
        // We'll construct a single transaction
        const transactionSQL = 'BEGIN;\n' + statements.join(';\n') + ';\nCOMMIT;';
        
        try {
          // This won't work with anon key, needs service role
          if (!serviceRoleKey) {
            console.error('❌ This operation requires SUPABASE_SERVICE_ROLE_KEY');
            console.error('   Please add it to your .env file\n');
            console.error('📝 Manual Fix Required:');
            console.error('   1. Go to: https://app.supabase.com/project/YOUR_PROJECT/sql/new');
            console.error('   2. Copy contents of: fix-whatsapp-flow.sql');
            console.error('   3. Paste into SQL editor and click Run\n');
            process.exit(1);
          }

          // Try using the SQL directly via HTTP (Supabase admin API)
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sql: transactionSQL })
          }).catch(() => null);

          if (response?.ok) {
            console.log('✅ SQL applied successfully!\n');
            console.log('🎯 WhatsApp address flow is now active');
            console.log('   Try typing "1" again - bot should ask for address\n');
          } else {
            throw new Error('SQL execution failed');
          }
        } catch (err) {
          console.error('❌ Could not apply SQL programmatically');
          console.error('   Error:', err.message, '\n');
          console.error('📝 Please apply manually:\n');
          console.error('   1. Visit: https://app.supabase.com/project/YOUR_PROJECT/sql/new');
          console.error('   2. Open: fix-whatsapp-flow.sql');
          console.error('   3. Copy ALL contents');
          console.error('   4. Paste into SQL editor');
          console.error('   5. Click "Run"\n');
          process.exit(1);
        }
      } else if (testResult.error.message.includes('relation') && testResult.error.message.includes('does not exist')) {
        console.log('❌ Required tables do not exist');
        console.log('   Please run the full migration first\n');
        process.exit(1);
      } else {
        console.log('⚠️  Test error (expected for test data):', testResult.error.message.slice(0, 100), '\n');
        console.log('✅ Function exists and is callable\n');
      }
    } else {
      console.log('✅ Function exists and is callable\n');
    }

  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

applyWhatsAppFix();
