import fs from 'fs';

let content = fs.readFileSync('./src/pages/Orders.tsx', 'utf8');

const oldBlock = `  // Fallback to substring match (only for Latin text)
  const { data: substringMatches } = await supabase
    .from('ozon_cities')
    .select('id, name')
    .ilike('name', \`%\${normalizedInput}%\`)
    .limit(1);

  if (substringMatches && substringMatches.length > 0) {
    return { ozon_city_id: substringMatches[0].id, city_name: substringMatches[0].name };
  }`;

const newBlock = `  // Fallback to fuzzy matching with carrier awareness and pg_trgm similarity (threshold = 0.65)
  const fuzzyResult = await matchCityFuzzy(cityName, 'ozon', 0.65);
  if (fuzzyResult.matched && fuzzyResult.city_id != null) {
    const numericId = typeof fuzzyResult.city_id === 'number' ? fuzzyResult.city_id : parseInt(String(fuzzyResult.city_id), 10);
    return { ozon_city_id: numericId, city_name: fuzzyResult.city_name };
  }`;

if (content.includes('Fallback to substring match')) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync('./src/pages/Orders.tsx', content);
  console.log('✅ Successfully updated Orders.tsx with fuzzy city matching!');
} else {
  console.log('⚠️ Could not find target substring block in Orders.tsx');
}
