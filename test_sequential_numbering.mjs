// Test sequential numbering by simulating a new order
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

async function testSequentialNumbering() {
  console.log('=== Testing Sequential Numbering ===\n');

  const workspaceId = '03826be0-e050-42d7-a030-a7d5a8d4f920';

  try {
    // Get current counter state
    const { data: currentCounter, error: counterError } = await supabase
      .from('google_sheets_order_counters')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (counterError) {
      console.error('Error getting counter:', counterError.message);
    } else {
      console.log('Current counter state:', currentCounter);
    }

    // Get next sequential number
    console.log('\nGetting next sequential number...');
    const { data: nextNumber, error: numberError } = await supabase
      .rpc('get_next_google_sheets_order_number', {
        p_workspace_id: workspaceId
      });

    if (numberError) {
      console.error('Error getting next number:', numberError.message);
      return;
    }

    console.log('✅ Next sequential number:', nextNumber);

    // Get updated counter state
    const { data: updatedCounter, error: updatedError } = await supabase
      .from('google_sheets_order_counters')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (updatedError) {
      console.error('Error getting updated counter:', updatedError.message);
    } else {
      console.log('Updated counter state:', updatedCounter);
    }

    // Test a few more to verify sequence
    console.log('\nTesting sequence generation...');
    const numbers = [];
    for (let i = 0; i < 3; i++) {
      const { data: num, error: err } = await supabase
        .rpc('get_next_google_sheets_order_number', {
          p_workspace_id: workspaceId
        });
      
      if (err) {
        console.error(`Error in iteration ${i}:`, err.message);
      } else {
        numbers.push(num);
        console.log(`  Generated: ${num}`);
      }
    }

    // Verify uniqueness
    const uniqueNumbers = new Set(numbers);
    if (uniqueNumbers.size === numbers.length) {
      console.log('✅ All generated numbers are unique');
    } else {
      console.log('❌ Duplicate numbers detected!');
    }

    // Verify sequential pattern
    const extractedNumbers = numbers.map(n => parseInt(n.replace('GS-', ''), 10));
    const isSequential = extractedNumbers.every((num, i) => 
      i === 0 || num === extractedNumbers[i-1] + 1
    );
    
    if (isSequential) {
      console.log('✅ Numbers follow sequential pattern');
    } else {
      console.log('❌ Numbers do not follow sequential pattern');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSequentialNumbering();