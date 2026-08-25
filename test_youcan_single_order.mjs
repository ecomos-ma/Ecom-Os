import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== TEST YOUCAN SINGLE ORDER DETAIL ENDPOINT ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const NURA_WORKSPACE_ID = '03826be0-e050-42d7-a030-a7d5a8d4f920';
const TEST_ORDER_ID = '920de463-def2-48dd-bf76-1716022b0a65'; // From earlier fetch

async function run() {
  try {
    // 1. Get workspace YouCan tokens
    console.log("1. GETTING YOUCAN TOKENS:");
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("youcan_access_token")
      .eq("id", NURA_WORKSPACE_ID)
      .single();

    if (wsError || !workspace) {
      console.log("   ❌ ERROR:", wsError?.message || "Workspace not found");
      return;
    }

    console.log("   ✅ Token found");
    console.log();

    // 2. Test single order endpoint
    console.log("2. TESTING SINGLE ORDER ENDPOINT:");
    console.log(`   GET https://api.youcan.shop/orders/${TEST_ORDER_ID}`);
    
    const res = await fetch(`https://api.youcan.shop/orders/${TEST_ORDER_ID}`, {
      headers: {
        Authorization: `Bearer ${workspace.youcan_access_token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.log("   ❌ API ERROR:", res.status, text);
      return;
    }

    const data = await res.json();
    console.log("   ✅ RESPONSE STRUCTURE:");
    console.log("   Top-level keys:", Object.keys(data));
    console.log();

    // 3. Check for customer data
    console.log("3. CHECKING FOR CUSTOMER DATA:");
    console.log("   Has 'customer' field:", 'customer' in data);
    console.log("   Has 'customer_id' field:", 'customer_id' in data);
    console.log("   Has 'shipping.address' field:", data.shipping?.address ? "YES" : "NO");
    console.log("   Has 'payment.address' field:", data.payment?.address ? "YES" : "NO");
    console.log();

    // 4. Print full response
    console.log("4. FULL RAW RESPONSE:");
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();
