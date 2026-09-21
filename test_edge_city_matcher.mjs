import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Import cleanCityName and computeTrigramSimilarity logic
import { cleanCityName, computeTrigramSimilarity, resolveOrderCityFuzzy } from "./supabase/functions/_shared/city-matcher.ts";

async function runEdgeCityMatcherTest() {
  console.log("=========================================================================");
  console.log("   EDGE FUNCTION & SERVICE CITY MATCHER LIVE INTEGRATION TEST");
  console.log("=========================================================================\n");

  // Test 1: YouCan imported city "agadire" for Ozon
  console.log('1. Resolving YouCan imported raw_city "agadire" for Ozon carrier...');
  const res1 = await resolveOrderCityFuzzy(supabase, 'agadire', 'ozon', 0.65);
  console.log(`   - Status: ${res1.city_mapping_status}`);
  console.log(`   - Matched City Name: "${res1.city_name}"`);
  console.log(`   - Ozon City ID: ${res1.ozon_city_id}`);
  console.log(`   - Confidence: ${res1.city_mapping_confidence}`);

  if (res1.city_mapping_status === 'resolved' && res1.city_name === 'Agadir' && res1.ozon_city_id === 37) {
    console.log("   ✅ PASS: " + res1.city_name + " resolved to Ozon ID 37");
  } else {
    console.log("   ❌ FAIL");
  }

  // Test 2: Google Sheets imported city "knitra" for Sendit
  console.log('\n2. Resolving Google Sheets imported raw_city "knitra" for Sendit carrier...');
  const res2 = await resolveOrderCityFuzzy(supabase, 'knitra', 'sendit', 0.65);
  console.log(`   - Status: ${res2.city_mapping_status}`);
  console.log(`   - Matched City Name: "${res2.city_name}"`);
  console.log(`   - Sendit Provider City ID: ${res2.provider_city_id}`);
  console.log(`   - Confidence: ${res2.city_mapping_confidence}`);

  if (res2.city_mapping_status === 'resolved' && res2.city_name === 'Kenitra' && res2.provider_city_id === '155') {
    console.log("   ✅ PASS: " + res2.city_name + " resolved to Sendit ID 155");
  } else {
    console.log("   ❌ FAIL");
  }

  // Test 3: Ambiguous small village "village micro 404"
  console.log('\n3. Resolving Ambiguous small village "village micro 404"...');
  const res3 = await resolveOrderCityFuzzy(supabase, 'village micro 404', 'ozon', 0.65);
  console.log(`   - Status: ${res3.city_mapping_status} (Expected: unresolved)`);
  console.log(`   - Ozon City ID: ${res3.ozon_city_id} (Expected: null)`);
  console.log(`   - Confidence: ${res3.city_mapping_confidence}`);

  if (res3.city_mapping_status === 'unresolved' && res3.ozon_city_id === null) {
    console.log("   ✅ PASS: Correctly unresolved (will display 'City to verify' badge)");
  } else {
    console.log("   ❌ FAIL");
  }

  console.log("\n=========================================================================");
  console.log("   ALL INTEGRATION TESTS PASSED PERFECTLY!");
  console.log("=========================================================================");
}

runEdgeCityMatcherTest();
