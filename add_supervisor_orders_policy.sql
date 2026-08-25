-- ============================================================
-- ADDITIVE FIX: Ajouter policy SELECT pour supervisors
-- SANS modifier ni supprimer les policies existantes
-- ============================================================

-- 1. Vérifier tous les rôles existants dans profiles
SELECT '=== ROLES EXISTANTS DANS PROFILES ===' as step;
SELECT DISTINCT role, COUNT(*) as count 
FROM profiles 
GROUP BY role 
ORDER BY count DESC;

-- 2. Afficher les policies actuelles sur orders (POUR VERIFICATION SEULEMENT)
SELECT '=== POLICIES ACTUELLES SUR ORDERS (AVANT MODIFICATION) ===' as step;
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY cmd, policyname;

-- 3. Créer la nouvelle policy SELECT pour supervisors ET autres rôles admin
-- Cette policy est ADDITIVE - elle ne remplace aucune policy existante
CREATE POLICY "Supervisors and admins can see all workspace orders"
  ON orders FOR SELECT
  USING (
    auth.role() = 'authenticated'::text
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('supervisor', 'owner', 'manager', 'admin')
      AND profiles.workspace_id = orders.workspace_id
    )
  );

-- 4. Vérifier que la nouvelle policy a été créée correctement
SELECT '=== POLICIES SUR ORDERS APRÈS AJOUT (NOUVELLE POLICY DOIT ÊTRE PRÉSENTE) ===' as step;
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY cmd, policyname;

-- 5. Validation: vérifier que la policy filtre bien par workspace_id
-- Simuler un test avec un workspace_id spécifique
SELECT '=== VALIDATION FILTRE WORKSPACE_ID ===' as step;
-- Cette requête vérifie la logique de la policy (pas les données réelles)
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'orders' 
      AND policyname = 'Supervisors and admins can see all workspace orders'
      AND cmd = 'SELECT'
      AND qual LIKE '%profiles.workspace_id = orders.workspace_id%'
    ) THEN '✅ Policy filtre correctement par workspace_id'
    ELSE '❌ Policy ne filtre pas par workspace_id - DANGER'
  END as validation_result;

-- 6. Validation: confirmer que les anciennes policies sont toujours présentes
SELECT '=== VALIDATION POLICIES EXISTANTES TOUJOURS PRÉSENTES ===' as step;
SELECT 
  policyname,
  CASE 
    WHEN policyname IN ('Agents can see their assigned orders', 'Agents can update their assigned orders', 'Managers can insert orders') 
    THEN '✅ Policy existante toujours présente'
    ELSE '⚠️  Policy nouvelle ou modifiée'
  END as status
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY policyname;

-- 7. Test réel : COUNT orders pour workspace Nura (en bypass RLS pour vérifier les données)
SELECT '=== TEST RÉEL DONNÉES WORKSPACE NURA (BYPASS RLS) ===' as step;
SELECT COUNT(*) as nura_orders_count
FROM orders 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- 8. Distribution des orders par workspace (en bypass RLS)
SELECT '=== DISTRIBUTION ORDERS PAR WORKSPACE (BYPASS RLS) ===' as step;
SELECT 
  w.id,
  w.name,
  COUNT(o.id) as orders_count
FROM workspaces w
LEFT JOIN orders o ON o.workspace_id = w.id
GROUP BY w.id, w.name
ORDER BY orders_count DESC
LIMIT 10;

-- 9. Rapport final
SELECT '=== RAPPORT FINAL ===' as step;
DO $$
DECLARE
  new_policy_exists int;
  old_policies_count int;
  total_policies_count int;
  nura_orders_count int;
BEGIN
  SELECT COUNT(*) INTO new_policy_exists
  FROM pg_policies 
  WHERE tablename = 'orders' 
  AND policyname = 'Supervisors and admins can see all workspace orders';
  
  SELECT COUNT(*) INTO old_policies_count
  FROM pg_policies 
  WHERE tablename = 'orders' 
  AND policyname IN ('Agents can see their assigned orders', 'Agents can update their assigned orders', 'Managers can insert orders');
  
  SELECT COUNT(*) INTO total_policies_count
  FROM pg_policies 
  WHERE tablename = 'orders';
  
  SELECT COUNT(*) INTO nura_orders_count
  FROM orders 
  WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';
  
  RAISE NOTICE '=== RAPPORT FIX ORDERS POLICY ===';
  RAISE NOTICE 'Nouvelle policy créée: %', CASE WHEN new_policy_exists > 0 THEN '✅ OUI' ELSE '❌ NON' END;
  RAISE NOTICE 'Policies existantes toujours présentes: %', old_policies_count;
  RAISE NOTICE 'Total policies sur orders: %', total_policies_count;
  RAISE NOTICE 'Orders dans workspace Nura (données réelles): %', nura_orders_count;
  
  IF new_policy_exists > 0 AND old_policies_count = 3 THEN
    RAISE NOTICE '✅ Fix appliqué correctement - nouvelle policy ajoutée, anciennes préservées';
  ELSE
    RAISE NOTICE '⚠️  Vérifier les résultats ci-dessus';
  END IF;
END $$;
