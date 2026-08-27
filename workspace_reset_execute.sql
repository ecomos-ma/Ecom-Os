-- ============================================================
-- WORKSPACE RESET EXECUTION SCRIPT
-- Deletes ALL data for a specific workspace while preserving:
-- - Workspace itself
-- - User profiles and access
-- - Integration credentials (YouCan tokens, Google Sheets, etc.)
-- - Reference data (cities, AI configs, etc.)
-- ============================================================

-- ⚠️  SAFETY CHECKS ⚠️
-- This script will DELETE ALL DATA for the specified workspace
-- Make sure you have the correct workspace_id before running!

-- Set your workspace_id here
-- REPLACE 'YOUR_WORKSPACE_ID_HERE' with your actual workspace UUID
DO $$
DECLARE
  v_workspace_id TEXT := 'YOUR_WORKSPACE_ID_HERE';
  v_workspace_name TEXT;
  v_user_count INT;
BEGIN
  -- Verify workspace exists
  SELECT name INTO v_workspace_name 
  FROM workspaces 
  WHERE id = v_workspace_id::uuid;
  
  IF v_workspace_name IS NULL THEN
    RAISE EXCEPTION 'Workspace with ID % does not exist!', v_workspace_id;
  END IF;
  
  -- Count users
  SELECT COUNT(*) INTO v_user_count
  FROM profiles
  WHERE workspace_id = v_workspace_id::uuid;
  
  RAISE NOTICE '=== WORKSPACE RESET SAFETY CHECK ===';
  RAISE NOTICE 'Workspace ID: %', v_workspace_id;
  RAISE NOTICE 'Workspace Name: %', v_workspace_name;
  RAISE NOTICE 'Number of Users: %', v_user_count;
  RAISE NOTICE '⚠️  THIS WILL DELETE ALL DATA IN THIS WORKSPACE ⚠️';
  RAISE NOTICE '⚠️  Workspace, users, and credentials will be PRESERVED ⚠️';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Replace YOUR_WORKSPACE_ID_HERE with your actual workspace UUID before running!';
END $$;

-- ============================================================
-- DELETE IN DEPENDENCY ORDER (child tables first)
-- ============================================================

BEGIN;

-- 1. Delete order-related data (most dependent)
DELETE FROM order_items 
WHERE order_id IN (
  SELECT id FROM orders WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid
);

DELETE FROM shipment_events 
WHERE shipment_id IN (
  SELECT id FROM shipments WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid
);

DELETE FROM shipments 
WHERE order_id IN (
  SELECT id FROM orders WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid
);

-- 2. Delete orders
DELETE FROM orders 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 3. Delete shipping logs and tracking data
DELETE FROM shipping_logs 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM shipping_sync_logs 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM shipping_provider_status 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 4. Delete inventory and stock history
DELETE FROM stock_history 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM inventory 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 5. Delete products
DELETE FROM products 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 6. Delete customers
DELETE FROM customers 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 7. Delete campaigns and ad data
DELETE FROM ad_spend 
WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid
);

DELETE FROM campaigns 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 8. Delete Meta/Facebook integration data
DELETE FROM meta_ads_daily 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM meta_campaigns 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM meta_settings 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 9. Delete expenses
DELETE FROM expenses 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 10. Delete notifications
DELETE FROM user_notifications 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM notifications 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 11. Delete team management data
DELETE FROM team_audit_log 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM team_invitations 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM performance_badges 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 12. Delete billing/invoice data
DELETE FROM workspace_invoices 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 13. Delete COD scenarios
DELETE FROM cod_scenarios 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 14. Delete shipping provider configurations (but NOT credentials)
DELETE FROM workspace_shipping_providers 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 15. Delete Google Sheets sync data (but NOT credentials)
DELETE FROM google_sheet_column_mappings 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM workspace_google_sheet_sync_log 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM workspace_google_sheet_sync 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM workspace_google_sheet_mapping 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- 16. Delete legacy integration status
DELETE FROM integration_status 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

DELETE FROM integrations 
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid;

-- ============================================================
-- PRESERVED DATA (NOT DELETED)
-- ============================================================
-- - workspaces (workspace itself)
-- - profiles (users and their access)
-- - youcan_tokens (OAuth tokens - unless you want to re-auth)
-- - youcan_credentials (OAuth credentials - unless you want to re-auth)
-- - google_sheets_credentials (Google Sheets setup - unless you want to re-setup)
-- - ozon_cities, coliaty_cities (reference data)
-- - city_arabic_names (reference data)
-- - ai_providers and all ai_* tables (AI configurations)
-- ============================================================

COMMIT;

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================
SELECT 
  '=== WORKSPACE RESET COMPLETE ===' as status,
  'YOUR_WORKSPACE_ID_HERE' as workspace_id,
  NOW() as reset_time;

-- Show remaining data counts (should be mostly zero except preserved tables)
-- Check that deleted tables are now empty
SELECT 
  '=== VERIFICATION: DELETED TABLES (should be 0) ===' as section,
  'orders' as table_name,
  (SELECT COUNT(*) FROM orders WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid)::TEXT as row_count
UNION ALL
SELECT 
  '=== VERIFICATION: DELETED TABLES (should be 0) ===' as section,
  'customers' as table_name,
  (SELECT COUNT(*) FROM customers WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid)::TEXT as row_count
UNION ALL
SELECT 
  '=== VERIFICATION: DELETED TABLES (should be 0) ===' as section,
  'products' as table_name,
  (SELECT COUNT(*) FROM products WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid)::TEXT as row_count
UNION ALL
SELECT 
  '=== VERIFICATION: DELETED TABLES (should be 0) ===' as section,
  'campaigns' as table_name,
  (SELECT COUNT(*) FROM campaigns WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid)::TEXT as row_count
UNION ALL
SELECT 
  '=== VERIFICATION: DELETED TABLES (should be 0) ===' as section,
  'shipping_logs' as table_name,
  (SELECT COUNT(*) FROM shipping_logs WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid)::TEXT as row_count
ORDER BY table_name;

-- Show preserved data counts (should still exist)
SELECT 
  '=== PRESERVED DATA (should still exist) ===' as section,
  'workspaces' as table_name,
  (SELECT COUNT(*) FROM workspaces WHERE id = 'YOUR_WORKSPACE_ID_HERE'::uuid)::TEXT as row_count
UNION ALL
SELECT 
  '=== PRESERVED DATA (should still exist) ===' as section,
  'profiles' as table_name,
  (SELECT COUNT(*) FROM profiles WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid)::TEXT as row_count
UNION ALL
SELECT 
  '=== PRESERVED DATA (should still exist) ===' as section,
  'youcan_tokens' as table_name,
  (SELECT COUNT(*) FROM youcan_tokens WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid)::TEXT as row_count
UNION ALL
SELECT 
  '=== PRESERVED DATA (should still exist) ===' as section,
  'youcan_credentials' as table_name,
  (SELECT COUNT(*) FROM youcan_credentials WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid)::TEXT as row_count
UNION ALL
SELECT 
  '=== PRESERVED DATA (should still exist) ===' as section,
  'google_sheets_credentials' as table_name,
  (SELECT COUNT(*) FROM google_sheets_credentials WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE'::uuid)::TEXT as row_count
ORDER BY table_name;