import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== FETCH RAW YOUCAN API ORDER RESPONSE ===\n");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const NURA_WORKSPACE_ID = '03826be0-e050-42d7-a030-a7d5a8d4f920';

async function run() {
  try {
    // 1. Get workspace YouCan tokens
    console.log("1. GETTING YOUCAN TOKENS FROM WORKSPACE:");
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("youcan_access_token, youcan_refresh_token, youcan_token_expires_at")
      .eq("id", NURA_WORKSPACE_ID)
      .single();

    if (wsError || !workspace) {
      console.log("   ❌ ERROR:", wsError?.message || "Workspace not found");
      return;
    }

    console.log("   ✅ Access token found:", workspace.youcan_access_token ? "YES" : "NO");
    console.log();

    // 2. Fetch one page of orders from YouCan API
    console.log("2. FETCHING ONE ORDER FROM YOUCAN API:");
    const res = await fetch("https://api.youcan.shop/orders?page=1&limit=1", {
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
    console.log("   ✅ API RESPONSE STRUCTURE:");
    console.log("   Top-level keys:", Object.keys(data));
    console.log();

    // 3. Print the full raw order JSON
    console.log("3. RAW ORDER JSON:");
    const orders = data.data || data.orders || [];
    if (orders.length > 0) {
      console.log(JSON.stringify(orders[0], null, 2));
    } else {
      console.log("   ❌ NO ORDERS IN RESPONSE");
    }

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
  }
}

run();
