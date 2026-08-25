import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== CHECK CUSTOMERS TABLE FOR YOUCAN SYNC ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const NURA_WORKSPACE_ID = '03826be0-e050-42d7-a030-a7d5a8d4f920';

async function run() {
  try {
    // 1. Check if any customers exist for this workspace
    console.log("1. CHECKING CUSTOMERS TABLE FOR WORKSPACE:");
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .eq('workspace_id', NURA_WORKSPACE_ID);

    if (customersError) {
      console.log("   ❌ ERROR:", customersError.message);
    } else {
      console.log("   ✅ CUSTOMERS COUNT:", customers?.length || 0);
      if (customers && customers.length > 0) {
        console.log("   Sample customers:");
        customers.slice(0, 3).forEach(c => {
          console.log(`   - ID: ${c.id}, Name: ${c.name}, Phone: ${c.phone}, City: ${c.city}`);
        });
      }
    }
    console.log();

    // 2. Check orders table for customer_id references
    console.log("2. CHECKING ORDERS TABLE FOR customer_id:");
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('order_number, customer_id, customer_name, phone, city, address')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .eq('source', 'youcan')
      .limit(5);

    if (ordersError) {
      console.log("   ❌ ERROR:", ordersError.message);
    } else {
      console.log("   ✅ YOUCAN ORDERS SAMPLE:");
      orders?.forEach(o => {
        console.log(`   - Order: ${o.order_number}`);
        console.log(`     customer_id: ${o.customer_id || 'NULL'}`);
        console.log(`     customer_name: ${o.customer_name || 'NULL'}`);
        console.log(`     phone: ${o.phone || 'NULL'}`);
        console.log(`     city: ${o.city || 'NULL'}`);
        console.log(`     address: ${o.address || 'NULL'}`);
      });
    }

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();
