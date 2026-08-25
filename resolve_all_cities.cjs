// Script to resolve ALL cities from orders table to Coliaty cities
// Run with: node resolve_all_cities.cjs

const fs = require('fs');
const { execSync } = require('child_process');

async function resolveAllCities() {
  console.log("=== Step 1: Fetch Coliaty cities using Supabase CLI ===");
  
  let coliatyCities;
  try {
    const output = execSync(
      'supabase db query --linked "SELECT id, name FROM coliaty_cities ORDER BY name;" --output-format json',
      { encoding: 'utf-8' }
    );
    coliatyCities = JSON.parse(output);
    console.log(`Fetched ${coliatyCities.length} Coliaty cities`);
  } catch (e) {
    console.error("Failed to fetch Coliaty cities:", e.message);
    return;
  }
  
  console.log("\n=== Step 2: Resolve order cities ===");
  
  const orderCities = [
    "Casablanca – Centre Ville", "Madyona", "Bournazel-casablanca", "Marrakech", "Oujda",
    "Agadir", "Agadir khmis ait 3mira", "Ait ourir-MARRAKECH", "Tanger", "Cacc",
    "Demnate", "Fes", "KENITRA VILLE", "L3yon", "Mohammedia", "Rabat", "Settate",
    "sidi abdelaziz-sidi slimane", "Tetouan", "النظور", "295 lot boutalamine errachidia",
    "aazayeb-chefchaouen", "AFRA-nador", "Agadir. TIKWIN", "Ain Allah-fes", "Ain Aouda-TEMARA",
    "akrach-RABAT", "Ben ahmad", "Ben ahmed-Berrchid", "BEN TAYEB- DRIOUCH", "Boumia",
    "Casa Blanca", "Casablanca 06 63 42 64 84", "Casablanxa", "Dakhla", "El aouama-tanger",
    "Elkalaadesrgna", "Essaouira الصويرة", "Hido ola may3jbk lhal", "Kaza", "kaza  3ncho9",
    "Laayoune-ville", "Mohameda", "Nador", "Njma", "RRabat hay kair yahkoub mansour e 585",
    "SALE", "Souksebt oulad nemma", "Tanger aouama gambouria", "Tanger mojahidin", "Tanja",
    "Taroudant", "TAZA-VILLE", "TEMARA", "Titwan", "Yamja", "Zaouiat Cheikh", "اسفي",
    "اكدير بلفاع", "الدارالبيضشار.يع..واد", "الدربيضاء عين شق المكنسة 4 بلوك c زنق 28 راقم 17",
    "الله ينعلكم يا ولاد الحرام الى يوم الدين", "اولاد برحيل", "بنسليمان", "تمارة المغرب",
    "تيطوان.سنيا.ترمل", "طانطان المغرب", "مراكش شارع العيون"
  ];

  console.log(`Found ${orderCities.length} unique cities in orders`);
    
  const results = {
    autoResolved: [],
    ambiguous: [],
    notFound: []
  };

  for (const city of orderCities) {
    const cityLower = city.trim().toLowerCase();

    // Try exact match first
    const exactMatch = coliatyCities.find(c => c.name.toLowerCase() === cityLower);

    if (exactMatch) {
      results.autoResolved.push({
        orderCity: city,
        coliatyCity: exactMatch.name,
        coliatyId: exactMatch.id,
        matchType: 'exact'
      });
      console.log(`✓ EXACT: "${city}" -> "${exactMatch.name}" (${exactMatch.id})`);
      continue;
    }

    // Try partial matches
    const partialMatches = coliatyCities.filter(c => cityLower.includes(c.name.toLowerCase()));

    if (partialMatches.length === 0) {
      results.notFound.push({
        orderCity: city,
        reason: 'No partial matches found'
      });
      console.log(`✗ NOT FOUND: "${city}"`);
    } else if (partialMatches.length === 1) {
      results.autoResolved.push({
        orderCity: city,
        coliatyCity: partialMatches[0].name,
        coliatyId: partialMatches[0].id,
        matchType: 'partial'
      });
      console.log(`✓ PARTIAL: "${city}" -> "${partialMatches[0].name}" (${partialMatches[0].id})`);
    } else {
      // Multiple partial matches - ambiguous
      results.ambiguous.push({
        orderCity: city,
        candidates: partialMatches.map(c => ({
          name: c.name,
          id: c.id
        }))
      });
      console.log(`? AMBIGUOUS: "${city}" (${partialMatches.length} candidates)`);
    }
  }

  console.log("\n=== RESULTS SUMMARY ===");
  console.log(`Auto-resolved: ${results.autoResolved.length}`);
  console.log(`Ambiguous: ${results.ambiguous.length}`);
  console.log(`Not found: ${results.notFound.length}`);

  console.log("\n=== AMBIGUOUS CASES (need manual validation) ===");
  for (const item of results.ambiguous) {
    console.log(`\nOrder city: "${item.orderCity}"`);
    console.log(`  Candidates (${item.candidates.length}):`);
    for (const cand of item.candidates) {
      console.log(`    - ${cand.name} (ID: ${cand.id})`);
    }
  }

  console.log("\n=== NOT FOUND CASES (no match in Coliaty cities) ===");
  for (const item of results.notFound) {
    console.log(`- "${item.orderCity}": ${item.reason}`);
  }

  console.log("\n=== Step 3: Insert auto-resolved mappings into city_arabic_names ===");
  let insertedCount = 0;
  let skippedCount = 0;

  for (const item of results.autoResolved) {
    // Check if mapping already exists using Supabase CLI
    try {
      const checkOutput = execSync(
        `supabase db query --linked "SELECT * FROM city_arabic_names WHERE carrier = 'coliaty' AND arabic_name = '${item.orderCity.replace(/'/g, "''")}' LIMIT 1;"`,
        { encoding: 'utf-8' }
      );

      if (checkOutput.includes('│')) {
        skippedCount++;
        console.log(`⊘ SKIPPED (exists): "${item.orderCity}"`);
        continue;
      }
    } catch (e) {
      // Assume doesn't exist if query fails
    }

    try {
      execSync(
        `supabase db query --linked "INSERT INTO city_arabic_names (carrier, arabic_name, carrier_city_id, ozon_city_id) VALUES ('coliaty', '${item.orderCity.replace(/'/g, "''")}', '${item.coliatyId}', NULL);"`,
        { encoding: 'utf-8' }
      );
      insertedCount++;
      console.log(`+ INSERTED: "${item.orderCity}" -> "${item.coliatyCity}" (ID: ${item.coliatyId})`);
    } catch (e) {
      console.error(`✗ FAILED to insert: "${item.orderCity}" - ${e.message}`);
    }
  }

  console.log(`\nInserted ${insertedCount} new mappings`);
  console.log(`Skipped ${skippedCount} existing mappings`);
}

resolveAllCities().catch(console.error);
