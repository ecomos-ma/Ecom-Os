import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runTests() {
  const queries = ['mrakch', 'casa', 'agadire', 'safi', 'knitra'];
  const providers = ['ozon', 'sendit', 'ameex'];

  console.log('=== FUZZY MATCHING SIMILARITY SCORES CALIBRATION ===\n');

  for (const provider of providers) {
    console.log(`\n--------------------------------------------------`);
    console.log(`CARRIER / PROVIDER: ${provider.toUpperCase()}`);
    console.log(`--------------------------------------------------`);

    for (const q of queries) {
      const { data, error } = await supabase.rpc('match_city_fuzzy_all_scores', {
        p_city_query: q,
        p_provider: provider,
        p_min_score: 0.1
      });

      if (error) {
        console.error(`❌ Error matching "${q}" for ${provider}:`, error.message);
      } else {
        console.log(`\nQuery: "${q}"`);
        if (!data || data.length === 0) {
          console.log(`  No candidate cities found (min_score >= 0.1)`);
        } else {
          data.slice(0, 3).forEach((item, idx) => {
            const isBest = idx === 0 ? ' [BEST]' : '';
            console.log(`  ${idx + 1}. ${item.name} (ID: ${item.id}) -> Score: ${Number(item.similarity_score).toFixed(4)}${isBest}`);
          });
        }
      }
    }
  }

  console.log('\n==================================================');
  console.log('=== THRESHOLD RESOLUTION TEST WITH CUTOFF 0.6 ===');
  console.log('==================================================');

  for (const provider of providers) {
    console.log(`\n--- Provider: ${provider.toUpperCase()} ---`);
    for (const q of queries) {
      const { data, error } = await supabase.rpc('match_city_fuzzy', {
        p_city_query: q,
        p_provider: provider,
        p_threshold: 0.6
      });

      if (error) {
        console.error(`❌ Error resolving "${q}":`, error.message);
      } else if (data && data.length > 0) {
        console.log(`✅ "${q}" => MATCHED to "${data[0].name}" (ID: ${data[0].id}, Score: ${Number(data[0].similarity_score).toFixed(4)})`);
      } else {
        console.log(`⚠️ "${q}" => UNRESOLVED (below 0.6 threshold -> needs manual check)`);
      }
    }
  }
}

runTests();
