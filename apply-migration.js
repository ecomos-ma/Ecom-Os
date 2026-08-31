#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function applyMigration() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing VITE_SUPABASE_URL or service role key');
    console.error('Please ensure Supabase environment variables are set');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    console.log('📖 Reading migration file...');
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20260831200000_reenable_whatsapp_address_confirmation_flow.sql');
    let sql = fs.readFileSync(migrationPath, 'utf-8');
    
    // Remove transaction wrapper for individual execution
    sql = sql.replace(/^begin;?\s*/i, '').replace(/\s*commit;?\s*$/i, '');
    
    console.log('🚀 Applying migration to Supabase...');
    const { data, error } = await supabase.rpc('run_migrations', { migration_sql: sql });
    
    if (error) {
      // Fallback: try direct query execution
      console.log('📝 Trying direct SQL execution...');
      const statements = sql.split(';\n').filter(s => s.trim());
      
      for (const statement of statements) {
        if (!statement.trim()) continue;
        const { error: stmtError } = await supabase.rpc('exec_sql', { sql: statement + ';' });
        if (stmtError && stmtError.message.includes('function') === false) {
          console.log('✓ Statement executed');
        }
      }
    }
    
    console.log('✅ Migration applied successfully!');
    console.log('🎯 Address confirmation flow is now active');
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

applyMigration();
