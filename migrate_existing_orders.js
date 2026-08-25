// Script to migrate existing orders to use ozon_city_id
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

// Normalize string for comparison (same logic as ozonService)
function normalizeString(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim();
}

// Check if string contains Arabic characters
function isArabic(str) {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicPattern.test(str);
}

// Resolve city ID using ozon_cities table with Arabic support
async function resolveCityId(cityName) {
  if (!cityName) return null;

  // If it's already a numeric ID, return it
  const trimmed = cityName.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // Try Arabic name match first if input contains Arabic
  if (isArabic(cityName)) {
    const { data: arabicMatch } = await supabase
      .from('city_arabic_names')
      .select('ozon_city_id')
      .eq('arabic_name', cityName.trim())
      .single();

    if (arabicMatch) return arabicMatch.ozon_city_id;

    // Try partial Arabic match
    const { data: arabicPartial } = await supabase
      .from('city_arabic_names')
      .select('ozon_city_id')
      .ilike('arabic_name', `%${cityName.trim()}%`)
      .limit(5);

    if (arabicPartial && arabicPartial.length > 0) {
      return arabicPartial[0].ozon_city_id;
    }

    // If Arabic and no match, don't fallback to Latin search to avoid false positives
    return null;
  }

  const normalizedInput = normalizeString(cityName);

  // Try exact match first
  const { data: exactMatch } = await supabase
    .from('ozon_cities')
    .select('id')
    .eq('name', normalizedInput)
    .single();

  if (exactMatch) return exactMatch.id;

  // Try alias match
  const { data: aliasMatch } = await supabase
    .from('city_aliases')
    .select('ozon_city_id')
    .eq('alias', normalizedInput)
    .single();

  if (aliasMatch) return aliasMatch.ozon_city_id;

  // Fallback to substring match (only for Latin text)
  const { data: substringMatches } = await supabase
    .from('ozon_cities')
    .select('id, name')
    .ilike('name', `%${normalizedInput}%`)
    .limit(10);

  if (substringMatches && substringMatches.length > 0) {
    // Return the first match (could be improved with scoring)
    return substringMatches[0].id;
  }

  return null;
}

async function migrateExistingOrders() {
  try {
    console.log('Starting migration of existing orders...');

    // Get all orders without ozon_city_id
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('order_number, city')
      .is('ozon_city_id', null)
      .not('city', 'is', null);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${orders.length} orders without ozon_city_id`);

    let resolvedCount = 0;
    let manualReviewCount = 0;
    const errors = [];

    // Process orders in batches
    const batchSize = 50;
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(orders.length / batchSize)} (${batch.length} orders)...`);

      for (const order of batch) {
        try {
          const cityId = await resolveCityId(order.city);

          if (cityId) {
            // Get city name from ozon_cities
            const { data: cityData } = await supabase
              .from('ozon_cities')
              .select('name')
              .eq('id', cityId)
              .single();

            // Update order with resolved city
            const { error: updateError } = await supabase
              .from('orders')
              .update({
                ozon_city_id: cityId,
                city_name: cityData?.name || order.city
              })
              .eq('order_number', order.order_number);

            if (updateError) {
              errors.push({ order: order.order_number, error: updateError.message });
            } else {
              resolvedCount++;
              console.log(`✓ Order #${order.order_number}: "${order.city}" → ID ${cityId}`);
            }
          } else {
            // Mark for manual review - we could add a flag column, but for now just log
            manualReviewCount++;
            console.log(`⚠ Order #${order.order_number}: "${order.city}" - needs manual review`);
          }
        } catch (err) {
          errors.push({ order: order.order_number, error: err.message });
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total orders processed: ${orders.length}`);
    console.log(`✅ Automatically resolved: ${resolvedCount} (${((resolvedCount / orders.length) * 100).toFixed(1)}%)`);
    console.log(`⚠️  Need manual review: ${manualReviewCount} (${((manualReviewCount / orders.length) * 100).toFixed(1)}%)`);
    console.log(`❌ Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(({ order, error }) => {
        console.log(`  - Order #${order}: ${error}`);
      });
    }

    if (manualReviewCount > 0) {
      console.log('\n⚠️  Orders needing manual review:');
      const { data: manualOrders } = await supabase
        .from('orders')
        .select('order_number, city')
        .is('ozon_city_id', null)
        .not('city', 'is', null)
        .limit(20);

      if (manualOrders) {
        manualOrders.forEach(o => {
          console.log(`  - #${o.order_number}: "${o.city}"`);
        });
        if (manualOrders.length === 20) {
          console.log(`  ... and ${manualReviewCount - 20} more`);
        }
      }
    }

    console.log('\n✅ Migration complete!');

  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
}

migrateExistingOrders();
