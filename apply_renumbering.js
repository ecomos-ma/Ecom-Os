// Script to apply the 10 renumberings safely
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load env manually
const envContent = readFileSync('.env', 'utf-8');
const envLines = envContent.split('\n');
const env = {};
envLines.forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyRenumbering() {
  try {
    console.log('=== STEP 1: Check for collisions with target order_numbers ===\n');

    const targetNumbers = [
      '#GS-20260704-80',
      '#GS-20260704-81',
      '#GS-20260704-82',
      '#GS-20260704-83',
      '#GS-20260704-84',
      '#GS-20260704-85',
      '#GS-20260704-86',
      '#GS-20260704-87',
      '#GS-20260704-88',
      '#GS-20260704-89'
    ];

    const { data: existingTargets, error: checkError } = await supabase
      .from('orders')
      .select('order_number')
      .in('order_number', targetNumbers);

    if (checkError) {
      throw checkError;
    }

    if (existingTargets && existingTargets.length > 0) {
      console.error('❌ COLLISION DETECTED - Target order_numbers already exist:');
      existingTargets.forEach(o => console.log(`  - ${o.order_number}`));
      process.exit(1);
    }

    console.log('✓ No collisions detected - all target order_numbers are available\n');

    console.log('=== STEP 2: Count unique order_numbers before renumbering ===\n');
    const { data: beforeCount, error: beforeError } = await supabase
      .from('orders')
      .select('order_number');

    if (beforeError) throw beforeError;
    const uniqueBefore = new Set(beforeCount.map(o => o.order_number));
    console.log(`Unique order_numbers before: ${uniqueBefore.size}`);
    console.log(`Total orders before: ${beforeCount.length}\n`);

    console.log('=== STEP 3: Apply renumberings ===\n');

    const renumberingMap = [
      { old: '#GS-20260704-11', new: '#GS-20260704-80', city: 'الدارالبيضشار.يع..واد' },
      { old: '#GS-20260704-12', new: '#GS-20260704-81', city: 'مراكش' },
      { old: '#GS-20260704-15', new: '#GS-20260704-82', city: 'Kaza' },
      { old: '#GS-20260704-3', new: '#GS-20260704-83', city: '433' },
      { old: '#GS-20260704-4', new: '#GS-20260704-84', city: '433' },
      { old: '#GS-20260704-5', new: '#GS-20260704-85', city: 'Agadir. TIKWIN' },
      { old: '#GS-20260704-6', new: '#GS-20260704-86', city: 'Driouch' },
      { old: '#GS-20260704-7', new: '#GS-20260704-87', city: 'Casablanca' },
      { old: '#GS-20260704-8', new: '#GS-20260704-88', city: 'Casa' },
      { old: '#GS-20260704-9', new: '#GS-20260704-89', city: 'مراكش' }
    ];

    for (const { old, new: newNum, city } of renumberingMap) {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ order_number: newNum })
        .match({ order_number: old, city });

      if (updateError) {
        console.error(`❌ FAILED: ${old} → ${newNum} (city="${city}")`);
        console.error(`   Error: ${updateError.message}`);
      } else {
        console.log(`✓ ${old} → ${newNum} (city="${city}")`);
      }
    }

    console.log('\n=== STEP 4: Verify no duplicates remain ===\n');

    const { data: afterCount, error: afterError } = await supabase
      .from('orders')
      .select('order_number');

    if (afterError) throw afterError;
    const uniqueAfter = new Set(afterCount.map(o => o.order_number));
    console.log(`Unique order_numbers after: ${uniqueAfter.size}`);
    console.log(`Total orders after: ${afterCount.length}`);

    // Check for remaining duplicates
    const orderNumberCount = new Map();
    afterCount.forEach(order => {
      const num = order.order_number;
      orderNumberCount.set(num, (orderNumberCount.get(num) || 0) + 1);
    });

    const remainingDuplicates = Array.from(orderNumberCount.entries())
      .filter(([_, count]) => count > 1);

    if (remainingDuplicates.length > 0) {
      console.log('\n❌ REMAINING DUPLICATES:');
      remainingDuplicates.forEach(([num, count]) => {
        console.log(`  ${num}: ${count} occurrences`);
      });
    } else {
      console.log('\n✓ No duplicate order_numbers remain');
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Orders lost: ${beforeCount.length - afterCount.length}`);
    console.log(`Duplicate order_numbers resolved: ${uniqueAfter.size - uniqueBefore.size}`);
    console.log(`Regression test: ${uniqueAfter.size === afterCount.length ? 'PASSED ✓' : 'FAILED ❌'}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

applyRenumbering();
