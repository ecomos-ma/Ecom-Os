import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectOrder() {
  console.log("=== 1. SEARCHING FOR ORDER YC-7034 OR CITY 'mrakch' IN DATABASE ===\n");

  // Search by order_number or youcan_order_id or raw_city/city containing '7034' or 'mrakch'
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .or("order_number.ilike.%7034%,youcan_order_id.ilike.%7034%,city.ilike.%mrakch%,raw_city.ilike.%mrakch%,city_name.ilike.%mrakch%")
    .limit(10);

  if (error) {
    console.error("❌ Database query error:", error.message);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log("No orders found matching '7034' or 'mrakch'. Searching all recent orders...");
    const { data: recents } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(10);
    console.log(`Found ${recents?.length || 0} recent orders:`);
    recents?.forEach(o => console.log(`- Order: ${o.order_number} | YC_ID: ${o.youcan_order_id} | City: "${o.city}" | RawCity: "${o.raw_city}" | CityName: "${o.city_name}" | Provider: ${o.shipping_provider} | OzonID: ${o.ozon_city_id} | Status: ${o.city_mapping_status}`));
    return;
  }

  console.log(`Found ${orders.length} matching order(s):\n`);
  orders.forEach((o, i) => {
    console.log(`--- Order #${i + 1} ---`);
    console.log(`id:                       ${o.id}`);
    console.log(`Order ID ("Order ID"):    ${o['Order ID']}`);
    console.log(`order_number:             ${o.order_number}`);
    console.log(`youcan_order_id:          ${o.youcan_order_id}`);
    console.log(`shipping_provider:        ${o.shipping_provider}`);
    console.log(`city:                     ${o.city}`);
    console.log(`raw_city:                 ${o.raw_city}`);
    console.log(`city_name:                ${o.city_name}`);
    console.log(`ozon_city_id:             ${o.ozon_city_id}`);
    console.log(`provider_city_id:         ${o.provider_city_id}`);
    console.log(`coliaty_city_id:          ${o.coliaty_city_id}`);
    console.log(`city_mapping_status:      ${o.city_mapping_status}`);
    console.log(`city_mapping_confidence:  ${o.city_mapping_confidence}`);
    console.log(`city_mapping_source:      ${o.city_mapping_source}`);
    console.log(`workspace_id:             ${o.workspace_id}`);
    console.log(`created_at:               ${o.created_at}`);
    console.log(`updated_at:               ${o.updated_at}\n`);
  });
}

inspectOrder();
