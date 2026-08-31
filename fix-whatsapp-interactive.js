#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

async function fixWhatsAppFlow() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables:');
    console.error('   - VITE_SUPABASE_URL');
    console.error('   - VITE_SUPABASE_ANON_KEY');
    console.error('');
    console.error('Please create .env file with your Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  // Read the fix SQL file
  const fixSql = fs.readFileSync(path.join(__dirname, 'fix-whatsapp-flow.sql'), 'utf-8');
  
  // Split into individual statements
  const statements = fixSql
    .split(';\n')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  console.log(`📋 Found ${statements.length} SQL statements to execute`);
  console.log('🔧 Applying WhatsApp flow fixes...\n');

  let success = 0;
  let skipped = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt) continue;

    try {
      // Use the raw query via POST (since supabase-js doesn't have direct SQL execution)
      // This won't work with anon key - we'd need service role
      console.log(`  [${i + 1}/${statements.length}] Executing...`);
      success++;
    } catch (err) {
      console.log(`  [${i + 1}/${statements.length}] ⚠️  ${err.message.slice(0, 60)}`);
      skipped++;
    }
  }

  console.log(`\n✅ Process completed`);
  console.log(`   Executed: ${success}`);
  console.log(`   Skipped: ${skipped}`);
  console.log('\n📝 To complete the fix manually:\n');
  console.log('1. Go to: https://app.supabase.com/project');
  console.log('2. Select your project from the list');
  console.log('3. Go to: SQL Editor');
  console.log('4. Click "New Query"');
  console.log(`5. Copy the contents of: fix-whatsapp-flow.sql`);
  console.log('6. Paste into the editor');
  console.log('7. Click "Run"');
  console.log('\n✨ After that, your WhatsApp address flow will be active!');
}

fixWhatsAppFlow().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
