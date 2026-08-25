// Test script to verify Google Sheets sync fix
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

async function testGoogleSheetsSync() {
  console.log('=== Testing Google Sheets Sync Fix ===\n');

  // Use the workspace with Google Sheets credentials
  const workspaceId = '03826be0-e050-42d7-a030-a7d5a8d4f920';
  console.log(`Testing with workspace: Nura (${workspaceId})`);

  try {
    // Check Google Sheets credentials
    const { data: credentials, error: credError } = await supabase
      .from('google_sheets_credentials')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (credError || !credentials) {
      console.log('⚠️  No Google Sheets credentials configured for this workspace');
      console.log('Skipping sync test');
      return;
    }

    console.log('✅ Google Sheets credentials found');
    console.log(`   Web App URL: ${credentials.web_app_url}`);

    // Count existing Google Sheets orders before sync
    const { data: existingOrders, error: countError } = await supabase
      .from('orders')
      .select('order_number, created_at')
      .eq('workspace_id', workspaceId)
      .eq('source', 'sheets')
      .order('created_at', { ascending: false })
      .limit(5);

    if (countError) {
      console.error('Failed to count existing orders:', countError.message);
    } else {
      console.log(`\nExisting Google Sheets orders: ${existingOrders?.length || 0}`);
      if (existingOrders && existingOrders.length > 0) {
        console.log('Recent orders:');
        existingOrders.forEach(order => {
          const isSequential = order.order_number.match(/^GS-\d+$/);
          const format = isSequential ? 'sequential' : 'legacy';
          console.log(`  - ${order.order_number} (${format})`);
        });
      }
    }

    // Invoke the sync function
    console.log('\n=== Invoking sync-google-sheets-orders ===');
    const { data, error } = await supabase.functions.invoke('sync-google-sheets-orders', {
      body: { workspace_id: workspaceId }
    });

    if (error) {
      console.error('❌ Sync function error:', error.message);
      if (error.context) {
        console.error('Context:', error.context);
      }
      return;
    }

    console.log('✅ Sync function completed');
    console.log('Response:', JSON.stringify(data, null, 2));

    // Check the results
    if (data?.stats) {
      console.log('\n=== Sync Results ===');
      console.log(`Processed: ${data.stats.processed}`);
      console.log(`Created: ${data.stats.created}`);
      console.log(`Updated: ${data.stats.updated}`);
      console.log(`Errors: ${data.stats.errors}`);

      if (data.stats.errors > 0 && data.errorDetails) {
        console.log('\nError details (first 5):');
        data.errorDetails.slice(0, 5).forEach((err, i) => {
          console.log(`  ${i + 1}. ${err}`);
        });
      }
    }

    // Check orders after sync
    const { data: newOrders, error: newCountError } = await supabase
      .from('orders')
      .select('order_number, created_at')
      .eq('workspace_id', workspaceId)
      .eq('source', 'sheets')
      .order('created_at', { ascending: false })
      .limit(5);

    if (newCountError) {
      console.error('Failed to count orders after sync:', newCountError.message);
    } else {
      console.log(`\nGoogle Sheets orders after sync: ${newOrders?.length || 0}`);
      if (newOrders && newOrders.length > 0) {
        console.log('Recent orders:');
        newOrders.forEach(order => {
          const isSequential = order.order_number.match(/^GS-\d+$/);
          const format = isSequential ? 'sequential' : 'legacy';
          console.log(`  - ${order.order_number} (${format})`);
        });
      }
    }

    // Check counter state
    const { data: counter, error: counterError } = await supabase
      .from('google_sheets_order_counters')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (counterError) {
      console.log('Counter check failed (may not exist yet):', counterError.message);
    } else if (counter) {
      console.log(`\nCounter state: next number = ${counter.next_sequence_number}`);
    } else {
      console.log('\nNo counter exists yet (will be created on first new order)');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testGoogleSheetsSync();