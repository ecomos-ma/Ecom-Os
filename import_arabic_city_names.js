// Script to import Arabic city names
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load env manually
const envContent = readFileSync('.env', 'utf-8');
const envLines = envContent.split('\n');
const env = {};
envLines.forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
);

// Arabic city names mapping - using city name patterns instead of refs
const ARABIC_CITY_NAMES = [
  // Casablanca
  { arabic: 'الدار البيضاء', cityPattern: 'casablanca' },
  { arabic: 'الدربيضاء', cityPattern: 'casablanca' },
  { arabic: 'الدار.البيضاء', cityPattern: 'casablanca' },
  { arabic: 'الدارالبيضاء', cityPattern: 'casablanca' },
  { arabic: 'الدار.البيضاى', cityPattern: 'casablanca' },
  { arabic: 'البيضاء', cityPattern: 'casablanca' },

  // Rabat
  { arabic: 'الرباط', cityPattern: 'rabat' },

  // Marrakech
  { arabic: 'مراكش', cityPattern: 'marrakech' },
  { arabic: 'مراكش نواحي', cityPattern: 'marrakech' },
  { arabic: 'مراكش الويدان', cityPattern: 'marrakech' },

  // Fes
  { arabic: 'فاس', cityPattern: 'fes' },

  // Tanger
  { arabic: 'طنجة', cityPattern: 'tanger' },
  { arabic: 'طَنجة', cityPattern: 'tanger' },

  // Tetouan
  { arabic: 'تطوان', cityPattern: 'tetouan' },
  { arabic: 'تيطوان', cityPattern: 'tetouan' },

  // Oujda
  { arabic: 'وجدة', cityPattern: 'oujda' },
  { arabic: 'بني ادرار. وجدة', cityPattern: 'oujda' },
  { arabic: 'بني درار اقليم وجدة', cityPattern: 'oujda' },

  // Salé
  { arabic: 'سلا', cityPattern: 'sale' },
  { arabic: 'سيدي سليمان', cityPattern: 'sidi slimane' },
  { arabic: 'سيدي سلمان', cityPattern: 'sidi slimane' },

  // Agadir
  { arabic: 'أكادير', cityPattern: 'agadir' },
  { arabic: 'اكدير', cityPattern: 'agadir' },
  { arabic: 'أكادير تيكون', cityPattern: 'agadir' },
  { arabic: 'أكدير بلفاع', cityPattern: 'agadir' },

  // Meknes
  { arabic: 'مكناس', cityPattern: 'meknes' },

  // Kenitra
  { arabic: 'القنيطرة', cityPattern: 'kenitra' },
  { arabic: 'كينترا', cityPattern: 'kenitra' },

  // Temara
  { arabic: 'تمارة', cityPattern: 'temara' },
  { arabic: 'تمارة عين عتيق', cityPattern: 'temara' },

  // Mohammedia
  { arabic: 'المحمدية', cityPattern: 'mohammedia' },
  { arabic: 'المحمدية شلالات', cityPattern: 'mohammedia' },

  // Laâyoune
  { arabic: 'العيون', cityPattern: 'laayoune' },

  // Safi
  { arabic: 'الصويرة', cityPattern: 'essaouira' },

  // Beni Mellal
  { arabic: 'بني ملال', cityPattern: 'beni mellal' },
  { arabic: 'دمنات', cityPattern: 'demnate' },

  // Taza
  { arabic: 'تازة', cityPattern: 'taza' },

  // El Jadida
  { arabic: 'الجديدة', cityPattern: 'el jadida' },

  // Settat
  { arabic: 'سطات', cityPattern: 'settat' },
  { arabic: 'سطت', cityPattern: 'settat' },

  // Ouarzazate
  { arabic: 'ورزازات', cityPattern: 'ouarzazate' },

  // Taroudant
  { arabic: 'تارودانت', cityPattern: 'taroudant' },

  // Dakhla
  { arabic: 'الداخله', cityPattern: 'dakhla' },

  // Nador
  { arabic: 'الناضور', cityPattern: 'nador' },
  { arabic: 'سلوان العمران إقليم الناضور', cityPattern: 'nador' },

  // Chefchaouen
  { arabic: 'شفشاون', cityPattern: 'chefchaouen' },

  // Al Hoceima
  { arabic: 'الحسيمة', cityPattern: 'al hoceima' },

  // Berkane
  { arabic: 'بركان', cityPattern: 'berkane' },

  // Ksar el Kebir
  { arabic: 'القصر الكبير', cityPattern: 'ksar el kebir' },

  // Other common Arabic city names
  { arabic: 'التوحيد', cityPattern: 'casablanca' }, // Likely Casablanca area
  { arabic: 'يت عمير', cityPattern: 'casablanca' }, // Likely Casablanca area
  { arabic: 'اب', cityPattern: 'casablanca' }, // Likely Casablanca area
  { arabic: 'حطان ناحية خريبكة', cityPattern: 'settat' }, // Settat area
  { arabic: 'شارع فاس البيضاء', cityPattern: 'casablanca' }, // Casablanca
  { arabic: 'موالي بسالهيام', cityPattern: 'rabat' }, // Rabat area
  { arabic: 'الدار البيضاء التشروك', cityPattern: 'casablanca' }, // Casablanca
  { arabic: 'زوية شيخ', cityPattern: 'zaouiat cheikh' }, // Zaouiat Cheikh
  { arabic: 'فاي', cityPattern: 'fes' }, // Fes area
  { arabic: 'رشيدشتوان', cityPattern: 'tetouan' }, // Tetouan area
];

async function importArabicCityNames() {
  try {
    console.log('Importing Arabic city names...');

    // Clear existing Arabic names
    console.log('Clearing existing city_arabic_names...');
    const { error: deleteError } = await supabase
      .from('city_arabic_names')
      .delete()
      .neq('id', 0);

    if (deleteError) {
      console.error('Error clearing existing Arabic names:', deleteError);
    } else {
      console.log('Existing Arabic names cleared');
    }

    // Get unique city patterns
    const uniquePatterns = [...new Set(ARABIC_CITY_NAMES.map(a => a.cityPattern))];
    console.log(`Looking up ${uniquePatterns.length} unique city patterns...`);

    // For each pattern, find the matching city (prefer exact match, then ilike)
    const patternToId = {};
    const notFound = [];

    for (const pattern of uniquePatterns) {
      // Try exact match first
      const { data: exactMatch } = await supabase
        .from('ozon_cities')
        .select('id, name, ref, delivered_price')
        .eq('name', pattern)
        .single();

      if (exactMatch) {
        patternToId[pattern] = exactMatch.id;
        console.log(`✓ Exact match for "${pattern}": ID ${exactMatch.id} (${exactMatch.name})`);
        continue;
      }

      // Try ilike match
      const { data: ilikeMatches } = await supabase
        .from('ozon_cities')
        .select('id, name, ref, delivered_price')
        .ilike('name', `%${pattern}%`)
        .order('delivered_price', { ascending: true }) // Prefer cities with lower delivery price (likely main cities)
        .limit(5);

      if (ilikeMatches && ilikeMatches.length > 0) {
        // Use the first match (lowest price)
        patternToId[pattern] = ilikeMatches[0].id;
        console.log(`✓ ILIKE match for "${pattern}": ID ${ilikeMatches[0].id} (${ilikeMatches[0].name})`);
      } else {
        notFound.push(pattern);
        console.log(`⚠ No match found for pattern: "${pattern}"`);
      }
    }

    console.log(`\nResolved ${Object.keys(patternToId).length}/${uniquePatterns.length} patterns`);
    if (notFound.length > 0) {
      console.log('Patterns not found:', notFound);
    }

    // Prepare Arabic names with their ozon_city_id
    const namesToInsert = [];
    const unresolved = [];

    ARABIC_CITY_NAMES.forEach(({ arabic, cityPattern }) => {
      const cityId = patternToId[cityPattern];
      if (cityId) {
        namesToInsert.push({
          ozon_city_id: cityId,
          arabic_name: arabic
        });
      } else {
        unresolved.push({ arabic, cityPattern });
      }
    });

    console.log(`\nPrepared ${namesToInsert.length} Arabic names to insert`);
    if (unresolved.length > 0) {
      console.log('Warning: Unresolved Arabic names:', unresolved);
    }

    // Insert in batches
    const batchSize = 50;
    let insertedCount = 0;

    for (let i = 0; i < namesToInsert.length; i += batchSize) {
      const batch = namesToInsert.slice(i, i + batchSize);
      console.log(`Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(namesToInsert.length / batchSize)} (${batch.length} names)...`);

      const { error } = await supabase
        .from('city_arabic_names')
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error);
      } else {
        insertedCount += batch.length;
        console.log(`✓ Batch ${Math.floor(i / batchSize) + 1} inserted successfully`);
      }
    }

    console.log(`\n✅ Import complete! ${insertedCount}/${namesToInsert.length} Arabic names imported`);

    // Show sample Arabic names
    const { data: sampleNames, error: sampleError } = await supabase
      .from('city_arabic_names')
      .select(`
        arabic_name,
        ozon_cities (
          name,
          ref
        )
      `)
      .limit(15);

    if (sampleError) {
      console.error('Error fetching sample Arabic names:', sampleError);
    } else {
      console.log('\nSample Arabic names from database:');
      console.log(JSON.stringify(sampleNames, null, 2));
    }

    // Verify key cities are covered
    console.log('\n🔍 Verifying key cities are covered:');
    const keyCities = ['casablanca', 'rabat', 'tanger', 'tetouan', 'sale', 'meknes'];
    for (const key of keyCities) {
      const cityId = patternToId[key];
      if (!cityId) {
        console.log(`⚠ ${key}: Pattern not resolved`);
        continue;
      }

      const { data: keyMatches } = await supabase
        .from('city_arabic_names')
        .select(`
          arabic_name,
          ozon_cities (
            name
          )
        `)
        .eq('ozon_city_id', cityId);

      if (keyMatches && keyMatches.length > 0) {
        console.log(`✓ ${key}: ${keyMatches.length} Arabic names → ${keyMatches[0].ozon_cities.name} (ID ${cityId})`);
      } else {
        console.log(`⚠ ${key}: No Arabic names found`);
      }
    }

  } catch (error) {
    console.error('Error during import:', error);
    process.exit(1);
  }
}

importArabicCityNames();
