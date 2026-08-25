// Script to propose renumbering for order_number collisions
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

// Helper to determine which order should keep the existing order_number
function shouldKeepExistingOrder(order1, order2) {
  // Priority 1: Status (returned > delivered/LIVRE > CONFIRME > pending)
  const statusPriority = {
    'returned': 4,
    'retour': 4,
    'livre': 3,
    'livré': 3,
    'delivered': 3,
    'confirme': 2,
    'confirmed': 2,
    'pending': 1,
    'new': 1
  };

  const priority1 = statusPriority[order1.status?.toLowerCase()] || 0;
  const priority2 = statusPriority[order2.status?.toLowerCase()] || 0;

  if (priority1 !== priority2) {
    // Higher priority status should be kept
    return priority1 > priority2 ? order1 : order2;
  }

  // Priority 2: Prefer one with tracking (commande already sent to Ozon)
  if (order1.tracking_number && !order2.tracking_number) return order1;
  if (order2.tracking_number && !order1.tracking_number) return order2;

  // Priority 3: Real city name over numeric "433" (data error)
  const isNumericCity = (city) => /^\d+$/.test(city?.trim() || '');
  const order1HasNumeric = isNumericCity(order1.city);
  const order2HasNumeric = isNumericCity(order2.city);

  if (order1HasNumeric !== order2HasNumeric) {
    return order1HasNumeric ? order2 : order1;
  }

  // Priority 4: Prefer earlier created_at
  return order1.created_at <= order2.created_at ? order1 : order2;
}

async function proposeRenumbering() {
  try {
    console.log('Proposing renumbering for order_number collisions...\n');

    // Get all orders with full details
    const { data: allOrders, error } = await supabase
      .from('orders')
      .select('order_number, city, status, delivery_status, tracking_number, phone, total, created_at, ozon_city_id, city_name');

    if (error) {
      throw error;
    }

    // Find duplicates
    const orderNumberDetails = new Map();

    allOrders.forEach(order => {
      const num = order.order_number;
      if (!orderNumberDetails.has(num)) {
        orderNumberDetails.set(num, []);
      }
      orderNumberDetails.get(num).push(order);
    });

    // Filter duplicates (count > 1) and exclude the 2 already cleaned
    const duplicates = Array.from(orderNumberDetails.entries())
      .filter(([_, details]) => details.length > 1)
      .filter(([orderNumber]) => orderNumber !== '#GS-20260704-1' && orderNumber !== '#GS-20260704-2')
      .sort((a, b) => a[0].localeCompare(b[0]));

    // Find the highest existing row index for generating new numbers
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('order_number')
      .like('order_number', '#GS-%');

    let maxRowIndex = 0;
    if (existingOrders) {
      for (const ord of existingOrders) {
        const parts = ord.order_number.split('-');
        const lastPart = parts[parts.length - 1];
        const rowNum = parseInt(lastPart, 10);
        if (!isNaN(rowNum) && rowNum > maxRowIndex) {
          maxRowIndex = rowNum;
        }
      }
    }

    console.log(`Found ${duplicates.length} order_number collisions to renumber.\n`);
    console.log(`Starting new sequence from: ${maxRowIndex + 1}\n`);

    const renumberingProposals = [];
    let newRowIndex = maxRowIndex + 1;

    duplicates.forEach(([orderNumber, details]) => {
      console.log(`=== ${orderNumber} ===`);
      details.forEach((order, idx) => {
        console.log(`[${idx + 1}] Phone: "${order.phone}", Total: ${order.total}, City: "${order.city}", Status: "${order.status}", Tracking: "${order.tracking_number || 'none'}"`);
      });

      const keepOrder = shouldKeepExistingOrder(details[0], details[1]);
      const renumberOrder = details.find(o => o !== keepOrder);

      // Extract date from existing order_number for consistency
      const dateMatch = orderNumber.match(/#GS-(\d{8})-/);
      const datePart = dateMatch ? dateMatch[1] : '20260704';
      const newOrderNumber = `#GS-${datePart}-${newRowIndex}`;

      console.log(`→ KEEP: [${keepOrder.city}] status="${keepOrder.status}" tracking="${keepOrder.tracking_number || 'none'}"`);
      console.log(`→ RENAME TO: ${newOrderNumber} [${renumberOrder.city}] status="${renumberOrder.status}" tracking="${renumberOrder.tracking_number || 'none'}"`);
      console.log('');

      renumberingProposals.push({
        oldOrderNumber: orderNumber,
        newOrderNumber: newOrderNumber,
        keepOrder: keepOrder,
        renumberOrder: renumberOrder
      });

      newRowIndex++;
    });

    console.log('\n=== RENUMBERING PROPOSALS SUMMARY ===');
    renumberingProposals.forEach(({ oldOrderNumber, newOrderNumber, keepOrder, renumberOrder }) => {
      console.log(`${oldOrderNumber}:`);
      console.log(`  KEEP: city="${keepOrder.city}", phone="${keepOrder.phone}", status="${keepOrder.status}"`);
      console.log(`  RENAME: city="${renumberOrder.city}" → ${newOrderNumber}`);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

proposeRenumbering();
