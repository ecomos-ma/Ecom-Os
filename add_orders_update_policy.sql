-- ============================================================
-- ADDITIVE FIX: Ajouter policy UPDATE pour supervisors sur orders
-- Pour permettre aux supervisors de modifier les commandes de leur workspace
-- ============================================================

-- 1. Vérifier les policies UPDATE actuelles sur orders
SELECT '=== POLICIES UPDATE SUR ORDERS (AVANT) ===' as step;
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'orders' AND cmd = 'UPDATE'
ORDER BY policyname;

-- 2. Ajouter la nouvelle policy UPDATE pour supervisors
CREATE POLICY "Supervisors and admins can update workspace orders"
  ON orders FOR UPDATE
  USING (
    auth.role() = 'authenticated'::text
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('supervisor', 'owner', 'manager', 'admin')
      AND profiles.workspace_id = orders.workspace_id
    )
  );

-- 3. Vérifier que la nouvelle policy a été créée
SELECT '=== POLICIES UPDATE SUR ORDERS (APRÈS) ===' as step;
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'orders' AND cmd = 'UPDATE'
ORDER BY policyname;

-- 4. Validation
SELECT '=== VALIDATION ===' as step;
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'orders' 
      AND policyname = 'Supervisors and admins can update workspace orders'
      AND cmd = 'UPDATE'
    ) THEN '✅ Policy UPDATE créée avec succès'
    ELSE '❌ Policy UPDATE non créée'
  END as validation_result;
