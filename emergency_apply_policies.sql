-- ============================================================
-- EMERGENCY FIX: Apply RLS UPDATE Policies and Verify
-- ============================================================

-- 1. Check if UPDATE policies exist
SELECT '=== CHECK UPDATE POLICIES ORDERS ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'orders' AND cmd = 'UPDATE'
ORDER BY policyname;

-- 2. Apply supervisor UPDATE policy for orders (if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'orders' 
    AND policyname = 'Supervisors and admins can update workspace orders'
    AND cmd = 'UPDATE'
  ) THEN
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
    RAISE NOTICE '✅ Orders UPDATE policy created';
  ELSE
    RAISE NOTICE '✅ Orders UPDATE policy already exists';
  END IF;
END $$;

-- 3. Apply supervisor UPDATE policy for customers (if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'customers' 
    AND policyname = 'Supervisors and admins can update workspace customers'
    AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY "Supervisors and admins can update workspace customers"
      ON customers FOR UPDATE
      USING (
        auth.role() = 'authenticated'::text
        AND EXISTS (
          SELECT 1 FROM profiles 
          WHERE profiles.id = auth.uid() 
          AND profiles.role IN ('supervisor', 'owner', 'manager', 'admin')
          AND profiles.workspace_id = customers.workspace_id
        )
      );
    RAISE NOTICE '✅ Customers UPDATE policy created';
  ELSE
    RAISE NOTICE '✅ Customers UPDATE policy already exists';
  END IF;
END $$;

-- 4. Verify policies after application
SELECT '=== POLICIES AFTER APPLICATION ===' as step;
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('orders', 'customers') AND cmd = 'UPDATE'
ORDER BY tablename, policyname;

-- 5. Test: Try to update a sample order (bypass RLS)
SELECT '=== TEST UPDATE (BYPASS RLS) ===' as step;
DO $$
DECLARE
  sample_order_id uuid;
  test_result text;
BEGIN
  -- Get a sample order ID
  SELECT "Order ID" INTO sample_order_id
  FROM orders
  WHERE workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920'
  LIMIT 1;
  
  IF sample_order_id IS NULL THEN
    RAISE NOTICE '⚠️  No orders found in workspace Nura for testing';
  ELSE
    -- Try to update (bypass RLS with SECURITY DEFINER function)
    -- For now, just report the ID
    RAISE NOTICE 'Sample Order ID for testing: %', sample_order_id;
  END IF;
END $$;
