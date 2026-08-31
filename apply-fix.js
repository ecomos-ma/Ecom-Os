#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { Client } = require('pg');

async function applyFix() {
  const connectionString = process.env.VITE_SUPABASE_URL
    ? `postgres://postgres:[PASSWORD]@${process.env.VITE_SUPABASE_URL.split('https://')[1].split('.supabase.co')[0]}.supabase.co:5432/postgres`
    : null;

  if (!connectionString) {
    console.error('❌ Cannot construct database connection URL');
    console.error('Make sure VITE_SUPABASE_URL is set in .env');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL || connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔌 Connecting to Supabase...');
    await client.connect();

    console.log('📝 Applying WhatsApp flow fix...');
    const fixSQL = fs.readFileSync(path.join(__dirname, 'fix-whatsapp-flow.sql'), 'utf-8');
    
    // Split and execute statements
    const statements = fixSQL.split(';\n').filter(s => s.trim());
    let count = 0;
    for (const statement of statements) {
      if (!statement.trim()) continue;
      try {
        await client.query(statement + ';');
        count++;
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.warn(`⚠️  Statement error: ${err.message.slice(0, 100)}`);
        }
      }
    }

    console.log(`✅ Applied ${count} SQL statements`);
    console.log('🎯 WhatsApp address confirmation flow is now active!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyFix();
