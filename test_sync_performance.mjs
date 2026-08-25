// Test script to measure Google Sheets sync performance
import { createClient } from '@supabase/supabase-js';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function measureSyncPerformance(workspaceId) {
  console.log('=== Google Sheets Sync Performance Test ===');
  console.log(`Workspace ID: ${workspaceId}`);
  console.log('');

  const measurements = {
    totalStart: Date.now(),
    fetchCredentials: 0,
    fetchWebApp: 0,
    processRows: 0,
    databaseUpsert: 0,
    totalEnd: 0
  };

  try {
    // Step 1: Fetch credentials
    console.log('Step 1: Fetching credentials...');
    const step1Start = Date.now();
    const { data: credentials, error: credError } = await supabase
      .from('google_sheets_credentials')
      .select('web_app_url')
      .eq('workspace_id', workspaceId)
      .single();
    
    measurements.fetchCredentials = Date.now() - step1Start;
    console.log(`✓ Credentials fetched in ${measurements.fetchCredentials}ms`);

    if (credError || !credentials?.web_app_url) {
      throw new Error('Web App URL not configured');
    }

    // Step 2: Fetch from Web App
    console.log('\nStep 2: Fetching data from Web App...');
    const step2Start = Date.now();
    const response = await fetch(credentials.web_app_url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow'
    });
    
    const text = await response.text();
    const webAppData = JSON.parse(text);
    measurements.fetchWebApp = Date.now() - step2Start;
    console.log(`✓ Web App data fetched in ${measurements.fetchWebApp}ms`);
    console.log(`  - Rows fetched: ${Array.isArray(webAppData) ? webAppData.length : 'N/A'}`);
    console.log(`  - Data size: ${text.length} characters`);

    if (!Array.isArray(webAppData)) {
      throw new Error('Web App did not return an array');
    }

    // Step 3: Process rows (simulate mapping)
    console.log('\nStep 3: Processing rows...');
    const step3Start = Date.now();
    let processed = 0;
    for (const row of webAppData) {
      // Simulate the mapping logic
      const sku = row["SKU"] || null;
      const phone = row["Phone"] || "";
      const orderDateStr = row["Order date"] || "";
      const syncKey = `${phone}_${orderDateStr || "no-date"}`;
      processed++;
    }
    measurements.processRows = Date.now() - step3Start;
    console.log(`✓ ${processed} rows processed in ${measurements.processRows}ms`);
    console.log(`  - Average per row: ${(measurements.processRows / processed).toFixed(2)}ms`);

    // Step 4: Call actual sync function
    console.log('\nStep 4: Calling sync function...');
    const step4Start = Date.now();
    const { data, error } = await supabase.functions.invoke('sync-google-sheets-orders', {
      body: { workspace_id: workspaceId }
    });
    measurements.databaseUpsert = Date.now() - step4Start;
    
    if (error) {
      console.error(`✗ Sync function error: ${error.message}`);
    } else {
      console.log(`✓ Sync function completed in ${measurements.databaseUpsert}ms`);
      console.log(`  - Results: ${JSON.stringify(data)}`);
    }

    measurements.totalEnd = Date.now();
    const totalTime = measurements.totalEnd - measurements.totalStart;

    // Print summary
    console.log('\n=== Performance Summary ===');
    console.log(`Total Time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`  - Fetch Credentials: ${measurements.fetchCredentials}ms (${((measurements.fetchCredentials / totalTime) * 100).toFixed(1)}%)`);
    console.log(`  - Fetch Web App Data: ${measurements.fetchWebApp}ms (${((measurements.fetchWebApp / totalTime) * 100).toFixed(1)}%)`);
    console.log(`  - Process Rows: ${measurements.processRows}ms (${((measurements.processRows / totalTime) * 100).toFixed(1)}%)`);
    console.log(`  - Database Upsert: ${measurements.databaseUpsert}ms (${((measurements.databaseUpsert / totalTime) * 100).toFixed(1)}%)`);
    
    console.log('\n=== Performance Analysis ===');
    if (measurements.fetchWebApp > totalTime * 0.5) {
      console.log('⚠️  Web App fetch is the bottleneck (>50% of total time)');
    }
    if (measurements.databaseUpsert > totalTime * 0.3) {
      console.log('⚠️  Database operations are slow (>30% of total time)');
    }
    if (processed > 0) {
      const avgTimePerRow = totalTime / processed;
      console.log(`Average time per row: ${avgTimePerRow.toFixed(2)}ms`);
      if (avgTimePerRow > 100) {
        console.log('⚠️  Per-row processing is slow (>100ms per row)');
      }
    }

  } catch (error) {
    console.error('Error during performance test:', error.message);
  }
}

// Get workspace ID from command line or use a default
const workspaceId = process.argv[2] || 'default-workspace-id';
measureSyncPerformance(workspaceId);