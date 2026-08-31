#!/usr/bin/env node
/**
 * WhatsApp Address Flow - Quick Fix
 * 
 * This script will:
 * 1. Check your .env configuration
 * 2. Detect the issue
 * 3. Apply the fix automatically OR show manual steps
 * 
 * Run: node quick-fix.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

async function checkConfig() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║     WhatsApp Address Flow - Quick Fix       ║');
  console.log('╚════════════════════════════════════════════╝\n');

  console.log('📋 Checking your configuration...\n');

  // Check .env
  if (!fs.existsSync(path.join(__dirname, '.env'))) {
    console.log('❌ .env file not found\n');
    console.log('Please create .env from .env.example:');
    console.log('  cp .env.example .env\n');
    process.exit(1);
  }

  if (!SUPABASE_URL) {
    console.log('❌ Missing: VITE_SUPABASE_URL\n');
    console.log('Add this to .env (from Supabase dashboard > Settings > API)');
    process.exit(1);
  }

  if (!ANON_KEY) {
    console.log('❌ Missing: VITE_SUPABASE_ANON_KEY\n');
    console.log('Add this to .env (from Supabase dashboard > Settings > API)');
    process.exit(1);
  }

  console.log('✅ VITE_SUPABASE_URL configured');
  console.log('✅ VITE_SUPABASE_ANON_KEY configured\n');

  if (!SERVICE_ROLE_KEY) {
    console.log('⚠️  SUPABASE_SERVICE_ROLE_KEY not found\n');
    console.log('For automatic fix, add this to .env:');
    console.log('  SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>\n');
    console.log('To get it:');
    console.log('  1. Go to: https://app.supabase.com/project/YOUR_PROJECT_ID/settings/api');
    console.log('  2. Under "Project API keys", copy the service_role key');
    console.log('  3. Add to .env as shown above\n');
    await showManualFix();
  } else {
    console.log('✅ SUPABASE_SERVICE_ROLE_KEY configured\n');
    console.log('🚀 Ready to apply automatic fix!\n');
    await applyAutomaticFix();
  }
}

async function showManualFix() {
  console.log('📝 MANUAL FIX (No Service Role Key):\n');
  console.log('1. Open browser: https://app.supabase.com/project/YOUR_PROJECT_ID/sql/new');
  console.log('2. In VS Code, open: fix-whatsapp-flow.sql');
  console.log('3. Select ALL (Ctrl+A), copy (Ctrl+C)');
  console.log('4. Go back to browser, paste (Ctrl+V)');
  console.log('5. Click "Run" button');
  console.log('6. Wait for: "Successfully executed NN queries"\n');
  console.log('Then test by sending "1" to WhatsApp bot\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Have you applied the fix manually? (y/n): ', (answer) => {
    rl.close();
    if (answer.toLowerCase() === 'y') {
      console.log('\n✅ Great! Your WhatsApp flow should now work.');
      console.log('Try sending "1" to test.\n');
    }
    process.exit(0);
  });
}

async function applyAutomaticFix() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'fix-whatsapp-flow.sql'), 'utf-8');
    
    console.log('Applying fix...\n');
    
    // Split statements
    const statements = sql
      .split(';\n')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements\n`);

    let applied = 0;
    let skipped = 0;

    for (const stmt of statements) {
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sql: stmt + ';' })
        });

        if (response.ok || response.status === 201) {
          applied++;
          const desc = stmt.substring(0, 50).replace(/\n/g, ' ');
          console.log(`✅ ${desc}...`);
        } else {
          skipped++;
        }
      } catch (e) {
        skipped++;
      }
    }

    console.log(`\n✅ Applied: ${applied} statements`);
    console.log(`⏭️  Skipped: ${skipped} statements\n`);
    console.log('🎯 WhatsApp address flow is now active!\n');
    console.log('Next: Try sending "1" to the WhatsApp bot\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('\nPlease use the manual fix instead\n');
    await showManualFix();
  }
}

checkConfig().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
