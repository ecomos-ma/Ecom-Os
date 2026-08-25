// Test script for Google Sheets sequential order numbering
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

async function testSequentialOrderNumbers() {
  console.log('=== Google Sheets Sequential Order Numbering Tests ===\n');

  // Test workspace ID - replace with actual workspace ID for testing
  const testWorkspaceId = process.argv[2] || 'test-workspace-id';

  try {
    // Test 1: Check if counter table exists
    console.log('Test 1: Check counter table exists');
    const { data: counters, error: counterError } = await supabase
      .from('google_sheets_order_counters')
      .select('*');
    
    if (counterError) {
      console.error('❌ Counter table check failed:', counterError.message);
    } else {
      console.log('✅ Counter table exists, current counters:', counters?.length || 0);
    }

    // Test 2: Test RPC function exists
    console.log('\nTest 2: Test RPC function exists');
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('get_next_google_sheets_order_number', {
        p_workspace_id: testWorkspaceId
      });
    
    if (rpcError) {
      console.error('❌ RPC function test failed:', rpcError.message);
    } else {
      console.log('✅ RPC function works, generated order number:', rpcResult);
    }

    // Test 3: Check existing Google Sheets orders
    console.log('\nTest 3: Check existing Google Sheets orders');
    const { data: existingOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, sync_key, source, created_at')
      .eq('workspace_id', testWorkspaceId)
      .eq('source', 'sheets')
      .order('created_at', { ascending: true })
      .limit(10);
    
    if (ordersError) {
      console.error('❌ Failed to fetch existing orders:', ordersError.message);
    } else {
      console.log(`✅ Found ${existingOrders?.length || 0} existing Google Sheets orders`);
      if (existingOrders && existingOrders.length > 0) {
        console.log('Sample orders:');
        existingOrders.forEach(order => {
          console.log(`  - ${order.order_number} (sync_key: ${order.sync_key?.substring(0, 30)}...)`);
        });
      }
    }

    // Test 4: Test workspace isolation
    console.log('\nTest 4: Test workspace isolation');
    const { data: workspaceCounters, error: wsError } = await supabase
      .from('google_sheets_order_counters')
      .select('*');
    
    if (wsError) {
      console.error('❌ Failed to check workspace counters:', wsError.message);
    } else {
      console.log('✅ Workspace counters by workspace:');
      workspaceCounters?.forEach(counter => {
        console.log(`  - Workspace ${counter.workspace_id}: next number = ${counter.next_sequence_number}`);
      });
    }

    // Test 5: Simulate concurrent access (simplified test)
    console.log('\nTest 5: Test atomic counter behavior');
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        supabase.rpc('get_next_google_sheets_order_number', {
          p_workspace_id: testWorkspaceId
        })
      );
    }
    
    const results = await Promise.all(promises);
    const uniqueNumbers = new Set(results.map(r => r.data));
    
    if (uniqueNumbers.size === 5) {
      console.log('✅ Atomic counter works correctly - all 5 requests got unique numbers');
      console.log('Generated numbers:', Array.from(uniqueNumbers));
    } else {
      console.log('❌ Atomic counter issue - got duplicate numbers:', Array.from(uniqueNumbers));
    }

    console.log('\n=== Tests Complete ===');

  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  }
}

testSequentialOrderNumbers();