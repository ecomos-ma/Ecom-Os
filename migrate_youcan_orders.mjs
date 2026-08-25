import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrateYouCanOrderNumbers() {
  console.log("=== MIGRATING EXISTING YOUCAN ORDER NUMBERS TO SEQUENTIAL FORMAT ===\n");

  try {
    // Get all workspaces with YouCan orders
    const { data: workspaces, error: wsError } = await supabase
      .from('orders')
      .select('workspace_id')
      .eq('source', 'youcan')
      .not('order_number', 'like', 'YC-%');

    if (wsError) {
      console.error("Error fetching workspaces:", wsError);
      return;
    }

    const uniqueWorkspaceIds = [...new Set(workspaces?.map(w => w.workspace_id) || [])];
    console.log(`Found ${uniqueWorkspaceIds.length} workspace(s) with YouCan orders to migrate\n`);

    let totalRenamed = 0;
    const migrationResults = [];

    for (const workspaceId of uniqueWorkspaceIds) {
      console.log(`Processing workspace: ${workspaceId}`);
      
      // Get current counter value for this workspace
      const { data: counterData } = await supabase
        .from('youcan_order_counters')
        .select('next_sequence_number')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      let sequenceNumber = counterData?.next_sequence_number || 1;

      // Get orders to rename (UUID format, ordered chronologically)
      const { data: ordersToRename, error: ordersError } = await supabase
        .from('orders')
        .select('"Order ID", order_number, youcan_order_id, created_at')
        .eq('workspace_id', workspaceId)
        .eq('source', 'youcan')
        .like('order_number', '#YC-%')
        .order('created_at', { ascending: true });

      if (ordersError) {
        console.error(`  ❌ Error fetching orders for workspace ${workspaceId}:`, ordersError);
        migrationResults.push({
          workspace_id: workspaceId,
          renamed_count: 0,
          error: ordersError.message
        });
        continue;
      }

      if (!ordersToRename || ordersToRename.length === 0) {
        console.log(`  ℹ️  No orders to migrate in this workspace`);
        continue;
      }

      console.log(`  Found ${ordersToRename.length} orders to renumber`);

      const workspaceResults = [];
      
      for (const order of ordersToRename) {
        const oldOrderNumber = order.order_number;
        const newOrderNumber = `YC-${sequenceNumber}`;

        // Update order number
        const { error: updateError } = await supabase
          .from('orders')
          .update({ order_number: newOrderNumber })
          .eq('"Order ID"', order['Order ID']);

        if (updateError) {
          console.error(`    ❌ Failed to update order ${order['Order ID']}:`, updateError);
          workspaceResults.push({
            order_id: order['Order ID'],
            old_number: oldOrderNumber,
            new_number: newOrderNumber,
            success: false,
            error: updateError.message
          });
        } else {
          console.log(`    ✅ ${oldOrderNumber} → ${newOrderNumber}`);
          workspaceResults.push({
            order_id: order['Order ID'],
            old_number: oldOrderNumber,
            new_number: newOrderNumber,
            success: true
          });
          totalRenamed++;
        }

        sequenceNumber++;
      }

      // Update the counter to the final sequence number
      const { error: counterError } = await supabase
        .from('youcan_order_counters')
        .upsert({
          workspace_id: workspaceId,
          next_sequence_number: sequenceNumber
        }, {
          onConflict: 'workspace_id'
        });

      if (counterError) {
        console.error(`  ❌ Failed to update counter:`, counterError);
      } else {
        console.log(`  ✅ Counter updated to ${sequenceNumber}`);
      }

      migrationResults.push({
        workspace_id: workspaceId,
        renamed_count: workspaceResults.filter(r => r.success).length,
        failed_count: workspaceResults.filter(r => !r.success).length,
        results: workspaceResults.slice(0, 5) // Show first 5 results
      });
    }

    console.log(`\n=== MIGRATION COMPLETE ===`);
    console.log(`Total orders renumbered: ${totalRenamed}`);
    console.log(`\nSample results by workspace:`);
    
    migrationResults.forEach(result => {
      console.log(`\nWorkspace: ${result.workspace_id}`);
      console.log(`  Renamed: ${result.renamed_count}`);
      if (result.failed_count > 0) {
        console.log(`  Failed: ${result.failed_count}`);
      }
      if (result.results && result.results.length > 0) {
        console.log(`  Sample changes:`);
        result.results.forEach(r => {
          console.log(`    ${r.success ? '✅' : '❌'} ${r.old_number} → ${r.new_number}`);
        });
      }
    });

    // Verification
    console.log(`\n=== VERIFICATION ===`);
    const { data: remainingUUID } = await supabase
      .from('orders')
      .select('order_number')
      .eq('source', 'youcan')
      .like('order_number', '#YC-%')
      .limit(5);

    if (remainingUUID && remainingUUID.length > 0) {
      console.log(`⚠️  Still found ${remainingUUID.length} orders with UUID format (first 5):`);
      remainingUUID.forEach(o => console.log(`  - ${o.order_number}`));
    } else {
      console.log(`✅ All YouCan orders now use sequential format`);
    }

    const { data: sampleSequential } = await supabase
      .from('orders')
      .select('order_number, youcan_order_id, created_at')
      .eq('source', 'youcan')
      .like('order_number', 'YC-%')
      .order('created_at', { ascending: true })
      .limit(5);

    if (sampleSequential && sampleSequential.length > 0) {
      console.log(`\nSample sequential order numbers (chronological):`);
      sampleSequential.forEach((o, i) => {
        console.log(`  ${i + 1}. ${o.order_number} (youcan_order_id: ${o.youcan_order_id}, created: ${o.created_at})`);
      });
    }

  } catch (error) {
    console.error("❌ Migration failed:", error);
  }
}

migrateYouCanOrderNumbers();