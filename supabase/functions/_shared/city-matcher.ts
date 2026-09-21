import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";

export const CITY_ALIASES: Record<string, string> = {
  'casa': 'casablanca',
  'casablanca': 'casablanca',
  'casa blanca': 'casablanca',
  'dar beida': 'casablanca',
  'dar el beida': 'casablanca',
  'darbaida': 'casablanca',
  'derbaida': 'casablanca',
  'casablanka': 'casablanca',
  'kasa': 'casablanca',
  'kasa blanca': 'casablanca',
  'marrakech': 'marrakech',
  'mrakch': 'marrakech',
  'mrakech': 'marrakech',
  'marrakesh': 'marrakech',
  'marakesh': 'marrakech',
  'kech': 'marrakech',
  'kash': 'marrakech',
  'marrack': 'marrakech',
  'marack': 'marrakech',
  'markch': 'marrakech',
  'marrakch': 'marrakech',
  'marakch': 'marrakech',
  'mrkch': 'marrakech',
  'mrakesh': 'marrakech',
  'agadir': 'agadir',
  'agadire': 'agadir',
  'agadirr': 'agadir',
  'agadr': 'agadir',
  'agad': 'agadir',
  'agadeer': 'agadir',
  'kenitra': 'kenitra',
  'knitra': 'kenitra',
  'kinitra': 'kenitra',
  'kentra': 'kenitra',
  'kunitra': 'kenitra',
  'knetra': 'kenitra',
  'rabat': 'rabat',
  'rabatt': 'rabat',
  'rbt': 'rabat',
  'rebat': 'rabat',
  'tanger': 'tanger',
  'tangerr': 'tanger',
  'tanja': 'tanger',
  'tngr': 'tanger',
  'tanjah': 'tanger',
  'tangier': 'tanger',
  'tetouan': 'tetouan',
  'tetouane': 'tetouan',
  'tetwan': 'tetouan',
  'titwan': 'tetouan',
  'ttwan': 'tetouan',
  'titouan': 'tetouan',
  'fes': 'fes',
  'fez': 'fes',
  'fass': 'fes',
  'fas': 'fes',
  'meknes': 'meknes',
  'mknes': 'meknes',
  'meknas': 'meknes',
  'mkness': 'meknes',
  'mekness': 'meknes',
  'oujda': 'oujda',
  'ujda': 'oujda',
  'wejda': 'oujda',
  'owjda': 'oujda',
  'sale': 'sale',
  'salé': 'sale',
  'sla': 'sale',
  'slane': 'sale',
  'sal': 'sale',
  'el jadida': 'el jadida',
  'eljadida': 'el jadida',
  'jadida': 'el jadida',
  'jdeda': 'el jadida',
  'eljdeda': 'el jadida',
  'el jdeda': 'el jadida',
  'mohammedia': 'mohammedia',
  'mohamadia': 'mohammedia',
  'mohamdia': 'mohammedia',
  'mhamdia': 'mohammedia',
  'mohamedia': 'mohammedia',
  'beni mellal': 'beni mellal',
  'benimellal': 'beni mellal',
  'bni mellal': 'beni mellal',
  'bnimellal': 'beni mellal',
  'beni melal': 'beni mellal',
  'temara': 'temara',
  'tmara': 'temara',
  'temaraa': 'temara',
  'nador': 'nador',
  'nadhor': 'nador',
  'nedor': 'nador',
  'khouribga': 'khouribga',
  'khoribga': 'khouribga',
  'khribga': 'khouribga',
  'khoribka': 'khouribga',
  'safi': 'safi',
  'asfi': 'safi',
  'assfi': 'safi',
  'settat': 'settat',
  'stat': 'settat',
  'settate': 'settat',
  'state': 'settat',
  'errachidia': 'errachidia',
  'rachidia': 'errachidia',
  'er rachidia': 'errachidia',
  'rachidya': 'errachidia',
  'guelmim': 'guelmim',
  'golmim': 'guelmim',
  'gulmim': 'guelmim',
  'laayoune': 'laayoune',
  'laayoun': 'laayoune',
  'layoune': 'laayoune',
  'layoun': 'laayoune',
  'el aaiun': 'laayoune',
  'elaaiun': 'laayoune',
  'dakhla': 'dakhla',
  'dakhlaa': 'dakhla',
  'ed dakhla': 'dakhla',
  'el kelaa des sraghna': 'el kelaa des sraghna',
  'kelaa sraghna': 'el kelaa des sraghna',
  'kelaasraghna': 'el kelaa des sraghna',
  'kelaa des sraghna': 'el kelaa des sraghna',
  'qlat sraghna': 'el kelaa des sraghna',
  'elkelaa': 'el kelaa des sraghna',
  'taroudant': 'taroudant',
  'taroudante': 'taroudant',
  'troudant': 'taroudant',
  'rroudant': 'taroudant',
  'berkane': 'berkane',
  'berkan': 'berkane',
  'taza': 'taza',
  'tazaa': 'taza',
  'al hoceima': 'al hoceima',
  'alhoceima': 'al hoceima',
  'hoceima': 'al hoceima',
  'lhocima': 'al hoceima',
  'lhoceima': 'al hoceima',
  'larache': 'larache',
  'lahrache': 'larache',
  'larach': 'larache',
  'laredch': 'larache',
  'ksar el kebir': 'ksar el kebir',
  'ksarelgebir': 'ksar el kebir',
  'ksar kebir': 'ksar el kebir',
  'ksarelquebir': 'ksar el kebir',
  'berrechid': 'berrechid',
  'berchid': 'berrechid',
  'brechid': 'berrechid',
  'tiznit': 'tiznit',
  'teznit': 'tiznit',
  'fnideq': 'fnideq',
  'fnidq': 'fnideq',
  'martil': 'martil',
  'mourtil': 'martil',
  'chefchaouen': 'chefchaouen',
  'chaouen': 'chefchaouen',
  'chawen': 'chefchaouen',
  'chechaouen': 'chefchaouen',
  'ouarzazate': 'ouarzazate',
  'warzazat': 'ouarzazate',
  'warzazate': 'ouarzazate',
  'ouarzazat': 'ouarzazate',
  'khenifra': 'khenifra',
  'khnifra': 'khenifra',
  'sidi kacem': 'sidi kacem',
  'sidikacem': 'sidi kacem',
  'sidi slimane': 'sidi slimane',
  'sidislimane': 'sidi slimane',
  'souk el arbaa': 'souk el arbaa',
  'soukelarbaa': 'souk el arbaa',
  'souk arbaa': 'souk el arbaa',
  'skhirat': 'skhirat',
  'skhirate': 'skhirat',
  'shirat': 'skhirat',
  'bouznika': 'bouznika',
  'boznika': 'bouznika',
  'had soualem': 'had soualem',
  'hadsoualem': 'had soualem',
  'soualem': 'had soualem',
  'azrou': 'azrou',
  'azro': 'azrou',
  'ifrane': 'ifrane',
  'ifran': 'ifrane',
  'youssoufia': 'youssoufia',
  'youssoufya': 'youssoufia',
  'tan tan': 'tan tan',
  'tantan': 'tan tan',
};

export function cleanCityName(str: string): string {
  if (!str) return '';
  let s = str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  s = s.replace(/\b(ville|centre|region|provincial|annexe|secteur)\b/g, '')
       .replace(/\s+/g, ' ')
       .trim();

  return s;
}

function getTrigrams(str: string): Set<string> {
  const s = `  ${str} `;
  const trigrams = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) {
    trigrams.add(s.substring(i, i + 3));
  }
  return trigrams;
}

export function computeTrigramSimilarity(rawQuery: string, rawTarget: string): number {
  let q = cleanCityName(rawQuery);
  let t = cleanCityName(rawTarget);

  if (!q || !t) return 0;
  if (q.length < 3 && q !== t) return 0;

  if (CITY_ALIASES[q]) {
    q = CITY_ALIASES[q];
  }

  if (q === t) return 1.0;
  if (q.replace(/\s+/g, '') === t.replace(/\s+/g, '')) return 1.0;

  const qWords = q.split(' ').filter(w => w.length > 2);
  const tWords = t.split(' ').filter(w => w.length > 2);

  const lenRatio = Math.min(q.length, t.length) / Math.max(q.length, t.length);

  if (q.length >= 4 && (t.startsWith(q) || q.startsWith(t))) {
    if (lenRatio >= 0.7) {
      return 0.90;
    }
  }

  const tri1 = getTrigrams(q);
  const tri2 = getTrigrams(t);

  let intersection = 0;
  for (const tri of tri1) {
    if (tri2.has(tri)) {
      intersection++;
    }
  }

  if (tri1.size === 0 || tri2.size === 0) return 0;
  const rawScore = (2.0 * intersection) / (tri1.size + tri2.size);

  if (qWords.length > tWords.length && lenRatio < 0.65) {
    return rawScore * 0.7;
  }

  return rawScore;
}

/**
 * Resolves raw city text against the carrier's reference table in Supabase
 * for Edge Functions (YouCan webhook, Google Sheets sync, background reconciliation).
 */
export async function resolveOrderCityFuzzy(
  client: SupabaseClient,
  rawCity: string | null | undefined,
  carrier: string = 'ozon',
  threshold: number = 0.40
): Promise<{
  ozon_city_id: number | null;
  coliaty_city_id: number | null;
  provider_city_id: string | null;
  city_name: string | null;
  city_mapping_status: 'resolved' | 'unresolved';
  city_mapping_confidence: number;
}> {
  const query = (rawCity || '').trim();
  if (!query) {
    return {
      ozon_city_id: null,
      coliaty_city_id: null,
      provider_city_id: null,
      city_name: null,
      city_mapping_status: 'unresolved',
      city_mapping_confidence: 0
    };
  }

  const c = carrier.toLowerCase();
  let referenceCities: { id: number | string; name: string }[] = [];

  if (c === 'ozon') {
    const { data } = await client.from('ozon_cities').select('id, name');
    referenceCities = (data || []).map((x: any) => ({ id: x.id, name: x.name }));
  } else if (c === 'sendit') {
    const { data } = await client.from('sendit_city_mappings').select('sendit_city_id, city_name');
    referenceCities = (data || []).map((x: any) => ({ id: x.sendit_city_id, name: x.city_name }));
  } else if (c === 'ameex') {
    const { data } = await client.from('ameex_city_mappings').select('ameex_city_id, display_name');
    referenceCities = (data || []).map((x: any) => ({ id: x.ameex_city_id, name: x.display_name }));
  } else if (c === 'coliaty') {
    const { data } = await client.from('coliaty_cities').select('id, name');
    referenceCities = (data || []).map((x: any) => ({ id: x.id, name: x.name }));
  } else if (c === 'forcelog') {
    const { data } = await client.from('forcelog_cities').select('id, name');
    referenceCities = (data || []).map((x: any) => ({ id: x.id, name: x.name }));
  }

  if (referenceCities.length === 0) {
    return {
      ozon_city_id: null,
      coliaty_city_id: null,
      provider_city_id: null,
      city_name: query,
      city_mapping_status: 'unresolved',
      city_mapping_confidence: 0
    };
  }

  let bestMatch: { id: number | string; name: string; score: number } | null = null;

  for (const refCity of referenceCities) {
    const score = computeTrigramSimilarity(query, refCity.name);
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { id: refCity.id, name: refCity.name, score };
    }
  }

  if (bestMatch && bestMatch.score >= threshold) {
    const numericId = typeof bestMatch.id === 'number' ? bestMatch.id : parseInt(String(bestMatch.id), 10);
    return {
      ozon_city_id: c === 'ozon' ? numericId : null,
      coliaty_city_id: c === 'coliaty' ? numericId : null,
      provider_city_id: (c !== 'ozon' && c !== 'coliaty') ? String(bestMatch.id) : null,
      city_name: bestMatch.name,
      city_mapping_status: 'resolved',
      city_mapping_confidence: bestMatch.score
    };
  }

  return {
    ozon_city_id: null,
    coliaty_city_id: null,
    provider_city_id: null,
    city_name: query,
    city_mapping_status: 'unresolved',
    city_mapping_confidence: bestMatch ? bestMatch.score : 0
  };
}
