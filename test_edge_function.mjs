import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function testEdgeFunction() {
  console.log("=== 2. Testing Edge Function Access Control ===\n");

  // Test 1: No auth header (should fail)
  console.log("Test 1: No authentication header");
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/founder-internal-access?operation=status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, data);
    if (response.status === 401 && data.error === "Missing authorization header") {
      console.log("✅ Correctly rejected unauthenticated request");
    } else {
      console.log("❌ Should have rejected unauthenticated request");
    }
  } catch (e) {
    console.error("❌ Error:", e.message);
  }

  // Test 2: Invalid auth header (should fail)
  console.log("\nTest 2: Invalid authentication header");
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/founder-internal-access?operation=status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_token_12345'
      },
      body: JSON.stringify({})
    });
    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, data);
    if (response.status === 401 && data.error === "Invalid authentication") {
      console.log("✅ Correctly rejected invalid token");
    } else {
      console.log("❌ Should have rejected invalid token");
    }
  } catch (e) {
    console.error("❌ Error:", e.message);
  }

  // Test 3: Valid token but wrong user (simulate with service role - should fail)
  console.log("\nTest 3: Valid token but non-founder user");
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/founder-internal-access?operation=status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({})
    });
    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, data);
    // Service role doesn't have a user email, so it should fail
    if (response.status === 403 || response.status === 401) {
      console.log("✅ Correctly rejected non-founder user");
    } else {
      console.log("⚠️ Unexpected response - might need real user token");
    }
  } catch (e) {
    console.error("❌ Error:", e.message);
  }
}

testEdgeFunction();
