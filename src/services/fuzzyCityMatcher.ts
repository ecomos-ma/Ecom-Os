import { supabase } from '../lib/supabase.ts';

export interface FuzzyMatchResult {
  city_id: number | string | null;
  city_name: string;
  matched: boolean;
  confidence: number;
  provider: string;
}

// Standardized Darija & common city aliases map
const CITY_ALIASES: Record<string, string> = {
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

/**
 * Normalizes city strings by converting to lower case, removing accents,
 * and stripping generic carrier suffixes like "ville", "centre", "région de", etc.
 */
export function cleanCityName(str: string): string {
  if (!str) return '';
  let s = str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, ' ') // replace special characters with space
    .trim();

  // Strip common carrier suffixes & noise words
  s = s.replace(/\b(ville|centre|region|provincial|annexe|secteur)\b/g, '')
       .replace(/\s+/g, ' ')
       .trim();

  return s;
}

/**
 * Generates trigrams for pg_trgm similarity calculation
 */
function getTrigrams(str: string): Set<string> {
  const s = `  ${str} `;
  const trigrams = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) {
    trigrams.add(s.substring(i, i + 3));
  }
  return trigrams;
}

/**
 * Computes trigram similarity (equivalent to PostgreSQL pg_trgm similarity())
 */
export function computeTrigramSimilarity(rawQuery: string, rawTarget: string): number {
  let q = cleanCityName(rawQuery);
  let t = cleanCityName(rawTarget);

  if (!q || !t) return 0;
  if (q.length < 3 && q !== t) return 0;

  // Apply alias pre-normalization
  if (CITY_ALIASES[q]) {
    q = CITY_ALIASES[q];
  }

  // Exact cleaned match
  if (q === t) return 1.0;

  const qWords = q.split(' ').filter(w => w.length > 2);
  const tWords = t.split(' ').filter(w => w.length > 2);

  const lenRatio = Math.min(q.length, t.length) / Math.max(q.length, t.length);

  // Prefix match (e.g. "kenitra" matching "kenitra ville" or "casablanca" matching "casablanca centre")
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

  // Sub-locality penalty: if query contains extra unmatched words (like "douar ouled ali 99" or "el foka")
  if (qWords.length > tWords.length && lenRatio < 0.65) {
    return rawScore * 0.7;
  }

  return rawScore;
}

/**
 * Carrier specific reference city cache & lookup
 */
let ozonCitiesCache: { id: number; name: string }[] | null = null;
let senditCitiesCache: { sendit_city_id: number; city_name: string }[] | null = null;
let ameexCitiesCache: { ameex_city_id: number; display_name: string }[] | null = null;
let coliatyCitiesCache: { id: number; name: string }[] | null = null;
let forcelogCitiesCache: { id: number; name: string }[] | null = null;

export async function fetchCarrierCities(carrier: string) {
  const c = carrier.toLowerCase();
  if (c === 'ozon') {
    if (!ozonCitiesCache) {
      const { data } = await supabase.from('ozon_cities').select('id, name');
      ozonCitiesCache = data || [];
    }
    return ozonCitiesCache.map(x => ({ id: x.id, name: x.name }));
  } else if (c === 'sendit') {
    if (!senditCitiesCache) {
      const { data } = await supabase.from('sendit_city_mappings').select('sendit_city_id, city_name');
      senditCitiesCache = data || [];
    }
    return senditCitiesCache.map(x => ({ id: x.sendit_city_id, name: x.city_name }));
  } else if (c === 'ameex') {
    if (!ameexCitiesCache) {
      const { data } = await supabase.from('ameex_city_mappings').select('ameex_city_id, display_name');
      ameexCitiesCache = data || [];
    }
    return ameexCitiesCache.map((x: any) => ({ id: x.ameex_city_id, name: x.display_name }));
  } else if (c === 'coliaty') {
    if (!coliatyCitiesCache) {
      const { data } = await supabase.from('coliaty_cities').select('id, name');
      coliatyCitiesCache = data || [];
    }
    return coliatyCitiesCache.map((x: any) => ({ id: x.id, name: x.name }));
  } else if (c === 'forcelog') {
    if (!forcelogCitiesCache) {
      const { data } = await supabase.from('forcelog_cities').select('id, name');
      forcelogCitiesCache = data || [];
    }
    return forcelogCitiesCache.map((x: any) => ({ id: x.id, name: x.name }));
  }
  return [];
}

/**
 * Resolves a raw input city name against the specified carrier's official reference list
 * using fuzzy matching and a carrier confidence threshold (default 0.65).
 */
export async function matchCityFuzzy(
  rawCityName: string,
  carrier: string = 'ozon',
  threshold: number = 0.65,
  overrideReferenceCities?: { id: number | string; name: string }[]
): Promise<FuzzyMatchResult> {
  const trimmed = (rawCityName || '').trim();
  if (!trimmed) {
    return { city_id: null, city_name: '', matched: false, confidence: 0, provider: carrier };
  }

  // If already numeric ID
  if (/^\d+$/.test(trimmed)) {
    return { city_id: parseInt(trimmed, 10), city_name: trimmed, matched: true, confidence: 1.0, provider: carrier };
  }

  // Fetch carrier reference cities or use override
  const referenceCities = overrideReferenceCities || (await fetchCarrierCities(carrier));
  if (!referenceCities || referenceCities.length === 0) {
    return { city_id: null, city_name: trimmed, matched: false, confidence: 0, provider: carrier };
  }

  // Compute similarity against each reference city for THIS carrier only
  let bestMatch: { id: number | string; name: string; score: number } | null = null;

  for (const refCity of referenceCities) {
    const score = computeTrigramSimilarity(trimmed, refCity.name);
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { id: refCity.id, name: refCity.name, score };
    }
  }

  if (bestMatch && bestMatch.score >= threshold) {
    return {
      city_id: bestMatch.id,
      city_name: bestMatch.name,
      matched: true,
      confidence: bestMatch.score,
      provider: carrier
    };
  }

  // Under threshold: return unmatched result -> order needs manual check
  return {
    city_id: null,
    city_name: trimmed,
    matched: false,
    confidence: bestMatch ? bestMatch.score : 0,
    provider: carrier
  };
}
