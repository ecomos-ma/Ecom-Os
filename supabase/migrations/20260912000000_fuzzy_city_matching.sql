-- =============================================================================
-- Fuzzy City Matching Engine & Automatic Trigger (Universal for All Carriers)
-- Supports: Ozon, Sendit, Ameex, Coliaty, ForceLog
-- Uses pg_trgm similarity() to automatically resolve phonetically or
-- imperfectly spelled city names to their official counterpart in each
-- carrier's reference table.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- GIN indexes for fast similarity queries across all carrier reference tables
CREATE INDEX IF NOT EXISTS ozon_cities_name_trgm_idx
  ON public.ozon_cities USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS sendit_city_mappings_city_name_trgm_idx
  ON public.sendit_city_mappings USING gin (city_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ameex_city_mappings_display_name_trgm_idx
  ON public.ameex_city_mappings USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS coliaty_cities_name_trgm_idx
  ON public.coliaty_cities USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS forcelog_cities_name_trgm_idx
  ON public.forcelog_cities USING gin (name gin_trgm_ops);

-- =============================================================================
-- Helper function to clean city string (stripping noise words like "Ville", "Centre")
-- Supports both ASCII and Unicode Arabic characters
-- =============================================================================
CREATE OR REPLACE FUNCTION public.clean_city_name(p_str text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $clean_city_name$
DECLARE
  v_res text;
BEGIN
  IF p_str IS NULL OR trim(p_str) = '' THEN
    RETURN '';
  END IF;

  v_res := lower(trim(p_str));
  -- Strip accents if possible
  BEGIN
    v_res := unaccent(v_res);
  EXCEPTION WHEN OTHERS THEN
    -- unaccent fallback
  END;

  -- Replace non-alphanumeric chars (allowing Arabic chars \u0600-\u06FF) with spaces
  v_res := regexp_replace(v_res, '[^a-z0-9\u0600-\u06FF\s]', ' ', 'g');
  -- Strip noise suffixes (ville, centre, region, provincial, annexe, secteur)
  v_res := regexp_replace(v_res, '\m(ville|centre|region|provincial|annexe|secteur)\M', '', 'g');
  -- Collapse multiple spaces
  v_res := regexp_replace(v_res, '\s+', ' ', 'g');
  RETURN trim(v_res);
END;
$clean_city_name$;

-- =============================================================================
-- RPC: match_city_fuzzy
-- Returns top candidate match if similarity >= threshold (default 0.40)
-- Checks Arabic tables first, then Darija alias map, then trigram matching.
-- Supports: ozon, sendit, ameex, coliaty, forcelog
-- =============================================================================
CREATE OR REPLACE FUNCTION public.match_city_fuzzy(
  p_city_query  text,
  p_provider    text    DEFAULT 'ozon',
  p_threshold   numeric DEFAULT 0.40
)
RETURNS TABLE (
  id               bigint,
  name             text,
  similarity_score numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $match_city_fuzzy$
DECLARE
  v_query text;
  v_clean text;
  v_nospace text;
  v_prov text;
BEGIN
  v_query := lower(trim(p_city_query));
  IF v_query = '' OR v_query IS NULL THEN
    RETURN;
  END IF;

  v_prov := lower(trim(COALESCE(p_provider, 'ozon')));

  -- 1. Direct Arabic dictionary lookup
  IF v_prov = 'ozon' THEN
    RETURN QUERY
    SELECT 
      o.id::bigint,
      o.name::text,
      1.0::numeric AS similarity_score
    FROM public.city_arabic_names a
    JOIN public.ozon_cities o ON o.id = a.ozon_city_id
    WHERE lower(trim(a.arabic_name)) = v_query OR v_query LIKE ('%' || lower(trim(a.arabic_name)) || '%')
    ORDER BY length(a.arabic_name) DESC
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  ELSIF v_prov = 'sendit' THEN
    RETURN QUERY
    SELECT 
      c.sendit_city_id::bigint AS id,
      c.city_name::text        AS name,
      1.0::numeric             AS similarity_score
    FROM public.sendit_city_mappings c
    WHERE c.arabic_name IS NOT NULL AND (lower(trim(c.arabic_name)) = v_query OR v_query LIKE ('%' || lower(trim(c.arabic_name)) || '%'))
    ORDER BY length(c.arabic_name) DESC
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2. Comprehensive Moroccan City Alias & Phonetic Dictionary
  IF v_query IN ('casa', 'casablanca', 'casa blanca', 'dar beida', 'dar el beida', 'darbaida', 'derbaida', 'casablanka', 'kasa', 'kasa blanca') THEN
    v_clean := 'casablanca';
  ELSIF v_query IN ('marrakech', 'mrakch', 'mrakech', 'marrakesh', 'marakesh', 'kech', 'kash', 'marrack', 'marack', 'markch', 'marrakch', 'marakch', 'mrkch', 'mrakesh') THEN
    v_clean := 'marrakech';
  ELSIF v_query IN ('agadir', 'agadire', 'agadirr', 'agadr', 'agad', 'agadeer') THEN
    v_clean := 'agadir';
  ELSIF v_query IN ('kenitra', 'knitra', 'kinitra', 'kentra', 'kunitra', 'knetra') THEN
    v_clean := 'kenitra';
  ELSIF v_query IN ('rabat', 'rabatt', 'rbt', 'rebat') THEN
    v_clean := 'rabat';
  ELSIF v_query IN ('tanger', 'tangerr', 'tanja', 'tngr', 'tanjah', 'tangier') THEN
    v_clean := 'tanger';
  ELSIF v_query IN ('tetouan', 'tetouane', 'tetwan', 'titwan', 'ttwan', 'titouan') THEN
    v_clean := 'tetouan';
  ELSIF v_query IN ('fes', 'fez', 'fass', 'fas') THEN
    v_clean := 'fes';
  ELSIF v_query IN ('meknes', 'mknes', 'meknas', 'mkness', 'mekness') THEN
    v_clean := 'meknes';
  ELSIF v_query IN ('oujda', 'ujda', 'wejda', 'owjda') THEN
    v_clean := 'oujda';
  ELSIF v_query IN ('sale', 'salé', 'sla', 'slane', 'sal') THEN
    v_clean := 'sale';
  ELSIF v_query IN ('el jadida', 'eljadida', 'jadida', 'jdeda', 'eljdeda', 'el jdeda') THEN
    v_clean := 'el jadida';
  ELSIF v_query IN ('mohammedia', 'mohamadia', 'mohamdia', 'mhamdia', 'mohamedia') THEN
    v_clean := 'mohammedia';
  ELSIF v_query IN ('beni mellal', 'benimellal', 'bni mellal', 'bnimellal', 'beni melal') THEN
    v_clean := 'beni mellal';
  ELSIF v_query IN ('temara', 'tmara', 'temaraa') THEN
    v_clean := 'temara';
  ELSIF v_query IN ('nador', 'nadhor', 'nedor') THEN
    v_clean := 'nador';
  ELSIF v_query IN ('khouribga', 'khoribga', 'khribga', 'khoribka') THEN
    v_clean := 'khouribga';
  ELSIF v_query IN ('safi', 'asfi', 'assfi') THEN
    v_clean := 'safi';
  ELSIF v_query IN ('settat', 'stat', 'settate', 'state') THEN
    v_clean := 'settat';
  ELSIF v_query IN ('errachidia', 'rachidia', 'er rachidia', 'rachidya') THEN
    v_clean := 'errachidia';
  ELSIF v_query IN ('guelmim', 'golmim', 'gulmim') THEN
    v_clean := 'guelmim';
  ELSIF v_query IN ('laayoune', 'laayoun', 'layoune', 'layoun', 'el aaiun', 'elaaiun') THEN
    v_clean := 'laayoune';
  ELSIF v_query IN ('dakhla', 'dakhlaa', 'ed dakhla') THEN
    v_clean := 'dakhla';
  ELSIF v_query IN ('el kelaa des sraghna', 'kelaa sraghna', 'kelaasraghna', 'kelaa des sraghna', 'qlat sraghna', 'elkelaa') THEN
    v_clean := 'el kelaa des sraghna';
  ELSIF v_query IN ('taroudant', 'taroudante', 'troudant', 'rroudant') THEN
    v_clean := 'taroudant';
  ELSIF v_query IN ('berkane', 'berkan') THEN
    v_clean := 'berkane';
  ELSIF v_query IN ('taza', 'tazaa') THEN
    v_clean := 'taza';
  ELSIF v_query IN ('al hoceima', 'alhoceima', 'hoceima', 'lhocima', 'lhoceima') THEN
    v_clean := 'al hoceima';
  ELSIF v_query IN ('larache', 'lahrache', 'larach', 'laredch') THEN
    v_clean := 'larache';
  ELSIF v_query IN ('ksar el kebir', 'ksarelgebir', 'ksar kebir', 'ksarelquebir') THEN
    v_clean := 'ksar el kebir';
  ELSIF v_query IN ('berrechid', 'berchid', 'brechid') THEN
    v_clean := 'berrechid';
  ELSIF v_query IN ('tiznit', 'teznit') THEN
    v_clean := 'tiznit';
  ELSIF v_query IN ('fnideq', 'fnidq') THEN
    v_clean := 'fnideq';
  ELSIF v_query IN ('martil', 'mourtil') THEN
    v_clean := 'martil';
  ELSIF v_query IN ('chefchaouen', 'chaouen', 'chawen', 'chechaouen') THEN
    v_clean := 'chefchaouen';
  ELSIF v_query IN ('ouarzazate', 'warzazat', 'warzazate', 'ouarzazat') THEN
    v_clean := 'ouarzazate';
  ELSIF v_query IN ('khenifra', 'khnifra') THEN
    v_clean := 'khenifra';
  ELSIF v_query IN ('sidi kacem', 'sidikacem') THEN
    v_clean := 'sidi kacem';
  ELSIF v_query IN ('sidi slimane', 'sidislimane') THEN
    v_clean := 'sidi slimane';
  ELSIF v_query IN ('souk el arbaa', 'soukelarbaa', 'souk arbaa') THEN
    v_clean := 'souk el arbaa';
  ELSIF v_query IN ('skhirat', 'skhirate', 'shirat') THEN
    v_clean := 'skhirat';
  ELSIF v_query IN ('bouznika', 'boznika') THEN
    v_clean := 'bouznika';
  ELSIF v_query IN ('had soualem', 'hadsoualem', 'soualem') THEN
    v_clean := 'had soualem';
  ELSIF v_query IN ('azrou', 'azro') THEN
    v_clean := 'azrou';
  ELSIF v_query IN ('ifrane', 'ifran') THEN
    v_clean := 'ifrane';
  ELSIF v_query IN ('youssoufia', 'youssoufya') THEN
    v_clean := 'youssoufia';
  ELSIF v_query IN ('tan tan', 'tantan') THEN
    v_clean := 'tan tan';
  ELSE
    v_clean := public.clean_city_name(v_query);
  END IF;

  -- GUARD: Do not run trigram matching if cleaned query is too short or empty
  IF v_clean IS NULL OR length(v_clean) < 3 THEN
    RETURN;
  END IF;

  v_nospace := replace(v_clean, ' ', '');

  -- 3. Trigram & Space-Insensitive Matching across all carriers
  IF v_prov = 'ozon' THEN
    RETURN QUERY
    SELECT
      c.id::bigint,
      c.name::text,
      CASE 
        WHEN public.clean_city_name(c.name) = v_clean THEN 1.0::numeric
        WHEN replace(public.clean_city_name(c.name), ' ', '') = v_nospace THEN 1.0::numeric
        WHEN length(v_clean) >= 4 AND public.clean_city_name(c.name) LIKE (v_clean || '%') THEN 0.90::numeric
        ELSE similarity(public.clean_city_name(c.name), v_clean)::numeric
      END AS similarity_score
    FROM public.ozon_cities c
    WHERE 
      public.clean_city_name(c.name) = v_clean
      OR replace(public.clean_city_name(c.name), ' ', '') = v_nospace
      OR (length(v_clean) >= 4 AND public.clean_city_name(c.name) LIKE (v_clean || '%'))
      OR similarity(public.clean_city_name(c.name), v_clean) >= p_threshold
    ORDER BY similarity_score DESC
    LIMIT 1;

  ELSIF v_prov = 'sendit' THEN
    RETURN QUERY
    SELECT
      c.sendit_city_id::bigint AS id,
      c.city_name::text        AS name,
      CASE 
        WHEN public.clean_city_name(c.city_name) = v_clean THEN 1.0::numeric
        WHEN replace(public.clean_city_name(c.city_name), ' ', '') = v_nospace THEN 1.0::numeric
        WHEN length(v_clean) >= 4 AND public.clean_city_name(c.city_name) LIKE (v_clean || '%') THEN 0.90::numeric
        ELSE similarity(public.clean_city_name(c.city_name), v_clean)::numeric
      END AS similarity_score
    FROM public.sendit_city_mappings c
    WHERE 
      public.clean_city_name(c.city_name) = v_clean
      OR replace(public.clean_city_name(c.city_name), ' ', '') = v_nospace
      OR (length(v_clean) >= 4 AND public.clean_city_name(c.city_name) LIKE (v_clean || '%'))
      OR similarity(public.clean_city_name(c.city_name), v_clean) >= p_threshold
    ORDER BY similarity_score DESC
    LIMIT 1;

  ELSIF v_prov = 'ameex' THEN
    RETURN QUERY
    SELECT
      c.ameex_city_id::bigint AS id,
      c.display_name::text    AS name,
      CASE 
        WHEN public.clean_city_name(c.display_name) = v_clean THEN 1.0::numeric
        WHEN replace(public.clean_city_name(c.display_name), ' ', '') = v_nospace THEN 1.0::numeric
        WHEN length(v_clean) >= 4 AND public.clean_city_name(c.display_name) LIKE (v_clean || '%') THEN 0.90::numeric
        ELSE similarity(public.clean_city_name(c.display_name), v_clean)::numeric
      END AS similarity_score
    FROM public.ameex_city_mappings c
    WHERE 
      public.clean_city_name(c.display_name) = v_clean
      OR replace(public.clean_city_name(c.display_name), ' ', '') = v_nospace
      OR (length(v_clean) >= 4 AND public.clean_city_name(c.display_name) LIKE (v_clean || '%'))
      OR similarity(public.clean_city_name(c.display_name), v_clean) >= p_threshold
    ORDER BY similarity_score DESC
    LIMIT 1;

  ELSIF v_prov = 'coliaty' THEN
    RETURN QUERY
    SELECT
      c.id::bigint             AS id,
      c.name::text             AS name,
      CASE 
        WHEN public.clean_city_name(c.name) = v_clean THEN 1.0::numeric
        WHEN replace(public.clean_city_name(c.name), ' ', '') = v_nospace THEN 1.0::numeric
        WHEN length(v_clean) >= 4 AND public.clean_city_name(c.name) LIKE (v_clean || '%') THEN 0.90::numeric
        ELSE similarity(public.clean_city_name(c.name), v_clean)::numeric
      END AS similarity_score
    FROM public.coliaty_cities c
    WHERE 
      public.clean_city_name(c.name) = v_clean
      OR replace(public.clean_city_name(c.name), ' ', '') = v_nospace
      OR (length(v_clean) >= 4 AND public.clean_city_name(c.name) LIKE (v_clean || '%'))
      OR similarity(public.clean_city_name(c.name), v_clean) >= p_threshold
    ORDER BY similarity_score DESC
    LIMIT 1;

  ELSIF v_prov = 'forcelog' THEN
    RETURN QUERY
    SELECT
      c.id::bigint             AS id,
      c.name::text             AS name,
      CASE 
        WHEN public.clean_city_name(c.name) = v_clean THEN 1.0::numeric
        WHEN replace(public.clean_city_name(c.name), ' ', '') = v_nospace THEN 1.0::numeric
        WHEN length(v_clean) >= 4 AND public.clean_city_name(c.name) LIKE (v_clean || '%') THEN 0.90::numeric
        ELSE similarity(public.clean_city_name(c.name), v_clean)::numeric
      END AS similarity_score
    FROM public.forcelog_cities c
    WHERE 
      public.clean_city_name(c.name) = v_clean
      OR replace(public.clean_city_name(c.name), ' ', '') = v_nospace
      OR (length(v_clean) >= 4 AND public.clean_city_name(c.name) LIKE (v_clean || '%'))
      OR similarity(public.clean_city_name(c.name), v_clean) >= p_threshold
    ORDER BY similarity_score DESC
    LIMIT 1;

  ELSE
    RETURN;
  END IF;
END;
$match_city_fuzzy$;

GRANT EXECUTE ON FUNCTION public.match_city_fuzzy(text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_city_fuzzy(text, text, numeric) TO service_role;

-- =============================================================================
-- AUTOMATIC DATABASE TRIGGER ON ORDERS TABLE
-- Resolves city automatically for YouCan, Google Sheets, UI and API imports
-- Supports: Ozon, Sendit, Ameex, Coliaty, ForceLog
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_resolve_order_city_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $auto_resolve_order_city_trigger$
DECLARE
  v_raw_city text;
  v_carrier text;
  v_match record;
BEGIN
  v_raw_city := COALESCE(NULLIF(trim(NEW.raw_city), ''), NULLIF(trim(NEW.city), ''), NULLIF(trim(NEW.city_name), ''));
  
  -- Skip if no city text provided
  IF v_raw_city IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine carrier
  v_carrier := COALESCE(NULLIF(lower(trim(NEW.shipping_provider)), ''), 'ozon');

  -- Only perform fuzzy matching if city_id for this carrier is not already explicitly set
  IF v_carrier = 'ozon' AND NEW.ozon_city_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF v_carrier = 'coliaty' AND NEW.coliaty_city_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF (v_carrier = 'sendit' OR v_carrier = 'ameex' OR v_carrier = 'forcelog') AND NEW.provider_city_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Execute fuzzy match RPC logic (threshold 0.40)
  SELECT * INTO v_match
  FROM public.match_city_fuzzy(v_raw_city, v_carrier, 0.40);

  IF v_match.id IS NOT NULL THEN
    IF v_carrier = 'ozon' THEN
      NEW.ozon_city_id := v_match.id;
    ELSIF v_carrier = 'coliaty' THEN
      NEW.coliaty_city_id := v_match.id;
    ELSE
      NEW.provider_city_id := v_match.id::text;
    END IF;

    NEW.city_name := v_match.name;
    NEW.city := v_match.name;
    NEW.city_mapping_status := 'resolved';
    NEW.city_mapping_confidence := v_match.similarity_score;
    NEW.city_mapping_source := 'fuzzy_automatic';
  ELSE
    -- If no match found, keep raw_city as city and mark unresolved
    NEW.city := v_raw_city;
    NEW.city_name := NULL;
    NEW.ozon_city_id := NULL;
    NEW.provider_city_id := NULL;
    NEW.coliaty_city_id := NULL;
    NEW.city_mapping_status := 'unresolved';
    NEW.city_mapping_confidence := 0;
  END IF;

  RETURN NEW;
END;
$auto_resolve_order_city_trigger$;

DROP TRIGGER IF EXISTS trg_auto_resolve_order_city ON public.orders;
CREATE TRIGGER trg_auto_resolve_order_city
  BEFORE INSERT OR UPDATE OF city, raw_city, shipping_provider ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_resolve_order_city_trigger();

COMMENT ON TRIGGER trg_auto_resolve_order_city ON public.orders IS
  'Automatic DB trigger that resolves misspelled/phonetic city names to official provider cities for YouCan webhooks, Google Sheets sync, manual entries and API imports across all 5 carriers (Ozon, Sendit, Ameex, Coliaty, ForceLog).';
