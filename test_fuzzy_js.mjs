import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Trigram generator matching pg_trgm behavior
function getTrigrams(str) {
  const s = `  ${str.toLowerCase().trim()} `;
  const trigrams = new Set();
  for (let i = 0; i < s.length - 2; i++) {
    trigrams.add(s.substring(i, i + 3));
  }
  return trigrams;
}

// Trigram similarity (Dice coefficient on trigrams) matching pg_trgm similarity()
function pgTrgmSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const tri1 = getTrigrams(str1);
  const tri2 = getTrigrams(str2);
  
  let intersection = 0;
  for (const tri of tri1) {
    if (tri2.has(tri)) {
      intersection++;
    }
  }
  
  return (2.0 * intersection) / (tri1.size + tri2.size);
}

async function runCalibration() {
  console.log('=== FETCHING REFERENCE CITY DATA FROM SUPABASE ===\n');

  const { data: ozonCities, error: e1 } = await supabase.from('ozon_cities').select('id, name');
  const { data: senditCities, error: e2 } = await supabase.from('sendit_city_mappings').select('sendit_city_id, city_name');
  const { data: ameexCities, error: e3 } = await supabase.from('ameex_city_mappings').select('ameex_city_id, city_name');

  console.log(`Ozon Cities loaded: ${ozonCities ? ozonCities.length : 0}`);
  console.log(`Sendit Cities loaded: ${senditCities ? senditCities.length : 0}`);
  console.log(`Ameex Cities loaded: ${ameexCities ? ameexCities.length : 0}\n`);

  const testCases = ['mrakch', 'casa', 'agadire', 'safi', 'knitra'];
  
  const carriers = [
    { name: 'ozon', data: ozonCities || [], idKey: 'id', nameKey: 'name' },
    { name: 'sendit', data: senditCities || [], idKey: 'sendit_city_id', nameKey: 'city_name' },
    { name: 'ameex', data: ameexCities || [], idKey: 'ameex_city_id', nameKey: 'city_name' }
  ];

  console.log('================================================================');
  console.log('       FUZZY MATCHING SIMILARITY SCORES (pg_trgm logic)');
  console.log('================================================================\n');

  for (const carrier of carriers) {
    console.log(`\n--------------------------------------------------`);
    console.log(`CARRIER: ${carrier.name.toUpperCase()} (${carrier.data.length} cities)`);
    console.log(`--------------------------------------------------`);

    for (const query of testCases) {
      // Calculate score for all cities
      const scored = carrier.data.map(city => ({
        id: city[carrier.idKey],
        name: city[carrier.nameKey],
        score: pgTrgmSimilarity(query, city[carrier.nameKey])
      }));

      scored.sort((a, b) => b.score - a.score);

      console.log(`\nQuery: "${query}"`);
      const topMatches = scored.slice(0, 3);
      topMatches.forEach((match, idx) => {
        const flag = idx === 0 ? ' [BEST MATCH]' : '';
        console.log(`  ${idx + 1}. "${match.name}" (ID: ${match.id}) -> Score: ${match.score.toFixed(4)}${flag}`);
      });
    }
  }

  console.log('\n================================================================');
  console.log('       MATCHING RESULT WITH CONFIDENCE THRESHOLD = 0.65');
  console.log('================================================================\n');

  const THRESHOLD = 0.65;

  for (const carrier of carriers) {
    console.log(`\n--- CARRIER: ${carrier.name.toUpperCase()} ---`);
    for (const query of testCases) {
      const scored = carrier.data.map(city => ({
        id: city[carrier.idKey],
        name: city[carrier.nameKey],
        score: pgTrgmSimilarity(query, city[carrier.nameKey])
      }));
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];

      if (best && best.score >= THRESHOLD) {
        console.log(`✅ "${query}" => MATCHED to "${best.name}" (ID: ${best.id}, Score: ${best.score.toFixed(4)})`);
      } else if (best) {
        console.log(`⚠️ "${query}" => UNRESOLVED (Best candidate: "${best.name}" with score ${best.score.toFixed(4)} < ${THRESHOLD} -> Flagged "need to check")`);
      } else {
        console.log(`⚠️ "${query}" => UNRESOLVED (No candidates -> Flagged "need to check")`);
      }
    }
  }
}

runCalibration();
