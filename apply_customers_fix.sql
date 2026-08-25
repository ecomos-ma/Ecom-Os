-- ============================================================
-- CORRECTIF ADDITIF CUSTOMERS + IDENTIFICATION TABLE À RISQUE
-- Même pattern que orders : nouvelle policy SELECT sans toucher à l'existante
-- ============================================================

-- 1. Afficher la policy "agent only" sur customers pour confirmation
SELECT '=== POLICY "AGENT ONLY" SUR CUSTOMERS ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE cmd = 'SELECT' 
AND qual ILIKE '%agent%' 
AND qual NOT ILIKE '%supervisor%' 
AND qual NOT ILIKE '%owner%' 
AND qual NOT ILIKE '%manager%' 
AND qual NOT ILIKE '%admin%';

-- 2. Afficher TOUTES les policies SELECT sur customers (avant modification)
SELECT '=== TOUTES POLICIES SELECT SUR CUSTOMERS (AVANT MODIFICATION) ===' as step;
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'customers' AND cmd = 'SELECT'
ORDER BY policyname;

-- 3. Identifier la table à risque (high_risk_tables)
SELECT '=== TABLE À RISQUE IDENTIFIÉE ===' as step;
SELECT DISTINCT tablename
FROM pg_policies 
WHERE cmd = 'SELECT' 
AND qual IS NOT NULL 
AND qual NOT ILIKE '%supervisor%' 
AND qual NOT ILIKE '%owner%' 
AND qual NOT ILIKE '%manager%' 
AND qual NOT ILIKE '%admin%'
AND qual ILIKE '%role%';

-- 4. COUNT customers workspace Nura (avant modification - pour comparaison)
SELECT '=== COUNT CUSTOMERS WORKSPACE NURA (AVANT MODIFICATION) ===' as step;
SELECT COUNT(*) as customers_count_before
FROM customers 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- 5. Appliquer le correctif additif (NOUVELLE POLICY SELECT SEULEMENT)
CREATE POLICY "Supervisors and admins can see all workspace customers"
  ON customers FOR SELECT
  USING (
    auth.role() = 'authenticated'::text
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('supervisor', 'owner', 'manager', 'admin')
      AND profiles.workspace_id = customers.workspace_id
    )
  );

-- 6. Vérifier que la nouvelle policy a été créée
SELECT '=== POLICIES SELECT SUR CUSTOMERS (APRÈS AJOUT) ===' as step;
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'customers' AND cmd = 'SELECT'
ORDER BY policyname;

-- 7. Confirmer que les anciennes policies sont toujours présentes
SELECT '=== VÉRIFICATION POLICIES EXISTANTES TOUJOURS PRÉSENTES ===' as step;
SELECT 
  policyname,
  CASE 
    WHEN policyname = 'Supervisors and admins can see all workspace customers' 
    THEN '✅ Nouvelle policy créée'
    ELSE '✅ Policy existante préservée'
  END as status
FROM pg_policies 
WHERE tablename = 'customers' AND cmd = 'SELECT'
ORDER BY policyname;

-- 8. COUNT customers workspace Nura (après modification - doit être identique)
SELECT '=== COUNT CUSTOMERS WORKSPACE NURA (APRÈS MODIFICATION) ===' as step;
SELECT COUNT(*) as customers_count_after
FROM customers 
WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- 9. Validation : comparer avant/après
SELECT '=== VALIDATION COMPARAISON AVANT/APRÈS ===' as step;
SELECT 
  (SELECT COUNT(*) FROM customers WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920')::text as customers_count_after,
  CASE 
    WHEN (SELECT COUNT(*) FROM customers WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920') = 105
    THEN '✅ COUNT inchangé - données préservées'
    ELSE '⚠️  COUNT changé - vérifier'
  END as validation;
