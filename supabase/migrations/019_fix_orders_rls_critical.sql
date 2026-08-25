-- ============================================================
-- EcomOS · FIX CRITIQUE Orders RLS - Priorité URGENTE
-- Résout le problème des requêtes orders vides pour les workspaces existants
-- Workspace Nura (03826be0-e050-42d7-a030-a7d5a8d4f920) affecté
-- ============================================================

-- 1. Étendre la fonction user_has_workspace_access pour vérifier aussi orders
-- Mettre à jour la fonction existante pour être plus robuste
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(workspace_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Un utilisateur a accès si:
  -- 1. Il est supervisor
  -- 2. Son profile.workspace_id correspond
  -- 3. Il a une entrée profile_workspaces pour ce workspace
  SELECT 
    public.is_supervisor() 
    OR workspace_uuid = public.get_my_workspace_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_workspaces 
      WHERE profile_id = auth.uid() 
      AND workspace_id = workspace_uuid
    );
$$;

-- 2. Mettre à jour les policies RLS sur orders pour utiliser la nouvelle fonction
DROP POLICY IF EXISTS "Workspace isolation for orders" ON public.orders;
CREATE POLICY "Workspace isolation for orders"
  ON public.orders FOR ALL
  USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));

-- 3. Mettre à jour les policies RLS sur customers
DROP POLICY IF EXISTS "Workspace isolation for customers" ON public.customers;
CREATE POLICY "Workspace isolation for customers"
  ON public.customers FOR ALL
  USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));

-- 4. S'assurer que ozon_cities a les bonnes policies (lecture seule pour tous)
-- Les ozon_cities sont des données de référence, pas de workspace_id
ALTER TABLE ozon_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read ozon_cities" ON ozon_cities;
CREATE POLICY "Authenticated users can read ozon_cities"
  ON ozon_cities FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Supervisors can manage ozon_cities" ON ozon_cities;
CREATE POLICY "Supervisors can manage ozon_cities"
  ON ozon_cities FOR ALL
  USING (public.is_supervisor())
  WITH CHECK (public.is_supervisor());

-- 5. Vérifier et corriger city_aliases et city_arabic_names
ALTER TABLE city_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read city_aliases" ON city_aliases;
CREATE POLICY "Authenticated users can read city_aliases"
  ON city_aliases FOR SELECT
  USING (auth.role() = 'authenticated');

ALTER TABLE city_arabic_names ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read city_arabic_names" ON city_aliases;
CREATE POLICY "Authenticated users can read city_arabic_names"
  ON city_arabic_names FOR SELECT
  USING (auth.role() = 'authenticated');

-- 6. Créer une fonction RPC admin pour les orders (bypass RLS)
CREATE OR REPLACE FUNCTION public.admin_get_workspace_orders(workspace_uuid uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  order_number text,
  customer_id uuid,
  city text,
  total numeric,
  status text,
  created_at timestamptz,
  workspace_id uuid
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    o.id,
    o.order_number,
    o.customer_id,
    o.city,
    o.total,
    o.status,
    o.created_at,
    o.workspace_id
  FROM public.orders o
  WHERE workspace_uuid IS NULL OR o.workspace_id = workspace_uuid
  ORDER BY o.created_at DESC
  LIMIT 1000;
$$;

-- 7. Créer une fonction RPC admin pour les customers
CREATE OR REPLACE FUNCTION public.admin_get_workspace_customers(workspace_uuid uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  city text,
  workspace_id uuid
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    c.id,
    c.name,
    c.phone,
    c.city,
    c.workspace_id
  FROM public.customers c
  WHERE workspace_uuid IS NULL OR c.workspace_id = workspace_uuid
  ORDER BY c.created_at DESC
  LIMIT 1000;
$$;

-- 8. Grant access pour les nouvelles fonctions RPC
GRANT EXECUTE ON FUNCTION public.admin_get_workspace_orders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_workspace_customers(uuid) TO authenticated;

-- 9. Validation - tester l'accès au workspace Nura
DO $$
DECLARE
  nura_orders_count int;
  test_access boolean;
BEGIN
  -- Compter les orders pour le workspace Nura
  SELECT COUNT(*) INTO nura_orders_count
  FROM public.orders
  WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';
  
  -- Tester la fonction d'accès (retournera NULL sans contexte auth)
  SELECT public.user_has_workspace_access('03826be0-e050-42d7-a030-a7d5a8d4f920') INTO test_access;
  
  RAISE NOTICE '=== VALIDATION FIX ORDERS RLS ===';
  RAISE NOTICE 'Orders dans workspace Nura: %', nura_orders_count;
  RAISE NOTICE 'Test fonction accès (NULL = normal): %', test_access;
  
  IF nura_orders_count > 0 THEN
    RAISE NOTICE '✅ Données orders présentes - fix RLS devrait résoudre le problème';
  ELSE
    RAISE NOTICE '⚠️ Aucune order trouvée - vérifier les données';
  END IF;
END $$;

-- 10. Diagnostic rapide des policies actuelles
SELECT '10. Policies RLS après fix' as step;
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies 
WHERE tablename IN ('orders', 'customers', 'ozon_cities', 'city_aliases', 'city_arabic_names')
ORDER BY tablename, cmd;

-- 11. S'assurer que les colonnes récentes sont bien présentes
DO $$
DECLARE
  coliaty_city_id_exists int;
  youcan_order_id_exists int;
BEGIN
  SELECT COUNT(*) INTO coliaty_city_id_exists
  FROM information_schema.columns
  WHERE table_name = 'orders' AND column_name = 'coliaty_city_id';
  
  SELECT COUNT(*) INTO youcan_order_id_exists
  FROM information_schema.columns
  WHERE table_name = 'orders' AND column_name = 'youcan_order_id';
  
  RAISE NOTICE 'Colonnes récentes présentes:';
  RAISE NOTICE 'coliaty_city_id: %', CASE WHEN coliaty_city_id_exists > 0 THEN '✅' ELSE '❌' END;
  RAISE NOTICE 'youcan_order_id: %', CASE WHEN youcan_order_id_exists > 0 THEN '✅' ELSE '❌' END;
END $$;
