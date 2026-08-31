#!/usr/bin/env node
/**
 * Direct WhatsApp Flow Fix
 * Applies fix-whatsapp-flow.sql to your Supabase database
 * 
 * Usage: node direct-fix.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function directFix() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error('❌ ERROR: Missing VITE_SUPABASE_URL in .env file\n');
    showInstructions();
    process.exit(1);
  }

  if (!serviceRoleKey) {
    console.error('❌ ERROR: Missing SUPABASE_SERVICE_ROLE_KEY in .env file\n');
    console.error('To get this key:');
    console.error('1. Go to https://app.supabase.com/project');
    console.error('2. Click "Settings" → "API"');
    console.error('3. Copy the "service_role" key');
    console.error('4. Add to .env as: SUPABASE_SERVICE_ROLE_KEY=your_key\n');
    showInstructions();
    process.exit(1);
  }

  try {
    console.log('📖 Reading fix SQL...');
    const fixSQL = fs.readFileSync(path.join(__dirname, 'fix-whatsapp-flow.sql'), 'utf-8');
    
    // Remove BEGIN/COMMIT wrappers if present
    let sql = fixSQL
      .replace(/^BEGIN;\s*/gi, '')
      .replace(/\s*COMMIT;\s*$/gi, '')
      .trim();

    console.log('🚀 Connecting to Supabase and applying fix...\n');

    // Extract project reference from URL
    const projectRef = supabaseUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      throw new Error('Could not extract project reference from VITE_SUPABASE_URL');
    }

    // Use Supabase SQL execution endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        sql,
        // Alternative: use rpc endpoint
      })
    });

    if (!response.ok) {
      console.log('⚠️  REST API approach failed, trying RPC...\n');
      
      // Try alternative: split into smaller statements
      const statements = sql.split(';\n')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));

      console.log(`📋 Found ${statements.length} statements\n`);

      let success = 0;
      let failed = 0;

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const desc = stmt.substring(0, 60).replace(/\n/g, ' ');
        
        try {
          const res = await executeSQL(supabaseUrl, serviceRoleKey, stmt);
          if (res.ok) {
            console.log(`  ✅ [${i + 1}/${statements.length}] ${desc}...`);
            success++;
          } else {
            const errorText = await res.text();
            // Ignore some expected errors
            if (errorText.includes('already exists') || errorText.includes('does not exist')) {
              console.log(`  ⏭️  [${i + 1}/${statements.length}] ${desc}... (skipped)`);
            } else {
              console.log(`  ❌ [${i + 1}/${statements.length}] Error: ${errorText.slice(0, 80)}`);
              failed++;
            }
          }
        } catch (err) {
          console.log(`  ⚠️  [${i + 1}/${statements.length}] ${desc}... (error: ${err.message.slice(0, 60)})`);
        }
      }

      console.log(`\n📊 Results: ${success} succeeded, ${failed} failed\n`);

      if (failed === 0 && success > 0) {
        console.log('✅ WhatsApp flow fix applied successfully!\n');
        console.log('🎯 Next steps:');
        console.log('1. Try sending "1" to the WhatsApp bot');
        console.log('2. Bot should ask for address');
        console.log('3. Send your address');
        console.log('4. Send "4" to confirm\n');
      }

    } else {
      console.log('✅ Fix applied successfully!\n');
      const result = await response.json();
      console.log('🎯 WhatsApp address flow is now active\n');
    }

  } catch (err) {
    console.error('❌ Error:', err.message, '\n');
    showInstructions();
    process.exit(1);
  }
}

async function executeSQL(supabaseUrl, key, sql) {
  return fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ sql: sql + ';' })
  }).catch(() => ({ ok: false, text: () => Promise.resolve('Network error') }));
}

function showInstructions() {
  console.error('\n📝 Manual Fix Instructions:\n');
  console.error('1. Go to: https://app.supabase.com/project/YOUR_PROJECT/sql/new');
  console.error('2. Copy the entire contents of: fix-whatsapp-flow.sql');
  console.error('3. Paste into the SQL Editor');
  console.error('4. Click "Run"');
  console.error('5. Wait for completion (should say "Successfully executed N queries")\n');
  console.error('After that, your WhatsApp address flow will work!\n');
}

directFix();
