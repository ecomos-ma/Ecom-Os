-- ============================================================
-- DIAGNOSTIC: Check workspace_id columns in all reset tables
-- ============================================================

-- Create a temporary table to store results
CREATE TEMPORARY TABLE table_workspace_check AS
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN (
  'order_items',
  'shipments',
  'shipment_events',
  'shipping_logs',
  'orders',
  'customers',
  'inventory',
  'products',
  'campaigns',
  'expenses',
  'shipping_provider_credentials',
  'shipping_provider_status',
  'shipping_sync_logs',
  'workspace_shipping_providers',
  'google_sheet_column_mappings',
  'workspace_google_sheet_sync_log',
  'workspace_google_sheet_sync',
  'workspace_google_sheet_mapping',
  'integration_status',
  'integrations',
  'youcan_tokens',
  'meta_campaigns',
  'meta_ads_daily',
  'meta_settings',
  'ad_spend',
  'notifications',
  'team_invitations',
  'performance_badges',
  'team_audit_log',
  'workspace_invoices',
  'cod_scenarios',
  'workspaces'
)
AND column_name = 'workspace_id'
ORDER BY table_name;

-- Show which tables have workspace_id
SELECT '=== TABLES WITH workspace_id COLUMN ===' as step;
SELECT table_name, data_type, is_nullable FROM table_workspace_check;

-- Show which tables DON'T have workspace_id
SELECT '=== TABLES WITHOUT workspace_id COLUMN ===' as step;
SELECT DISTINCT table_name
FROM information_schema.columns
WHERE table_name IN (
  'order_items',
  'shipments',
  'shipment_events',
  'shipping_logs',
  'orders',
  'customers',
  'inventory',
  'products',
  'campaigns',
  'expenses',
  'shipping_provider_credentials',
  'shipping_provider_status',
  'shipping_sync_logs',
  'workspace_shipping_providers',
  'google_sheet_column_mappings',
  'workspace_google_sheet_sync_log',
  'workspace_google_sheet_sync',
  'workspace_google_sheet_mapping',
  'integration_status',
  'integrations',
  'youcan_tokens',
  'meta_campaigns',
  'meta_ads_daily',
  'meta_settings',
  'ad_spend',
  'notifications',
  'team_invitations',
  'performance_badges',
  'team_audit_log',
  'workspace_invoices',
  'cod_scenarios',
  'workspaces'
)
AND table_name NOT IN (SELECT table_name FROM table_workspace_check)
ORDER BY table_name;

-- For tables without workspace_id, show their primary key/foreign key columns
SELECT '=== FOREIGN KEY COLUMNS FOR TABLES WITHOUT workspace_id ===' as step;
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN (
  SELECT DISTINCT table_name
  FROM information_schema.columns
  WHERE table_name IN (
    'order_items',
    'shipments',
    'shipment_events',
    'shipping_logs',
    'orders',
    'customers',
    'inventory',
    'products',
    'campaigns',
    'expenses',
    'shipping_provider_credentials',
    'shipping_provider_status',
    'shipping_sync_logs',
    'workspace_shipping_providers',
    'google_sheet_column_mappings',
    'workspace_google_sheet_sync_log',
    'workspace_google_sheet_sync',
    'workspace_google_sheet_mapping',
    'integration_status',
    'integrations',
    'youcan_tokens',
    'meta_campaigns',
    'meta_ads_daily',
    'meta_settings',
    'ad_spend',
    'notifications',
    'team_invitations',
    'performance_badges',
    'team_audit_log',
    'workspace_invoices',
    'cod_scenarios',
    'workspaces'
  )
  AND table_name NOT IN (SELECT table_name FROM table_workspace_check)
)
AND (column_name LIKE '%id%' OR column_name LIKE '%_id' OR column_name LIKE '%workspace%')
ORDER BY table_name, column_name;
