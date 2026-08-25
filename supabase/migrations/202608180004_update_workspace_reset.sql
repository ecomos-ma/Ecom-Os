-- ============================================================
-- SAFE WORKSPACE RESET SYSTEM
-- Atomic, safe reset using exception handling for schema compatibility
-- ============================================================

-- Create a safe workspace reset function
CREATE OR REPLACE FUNCTION reset_workspace_completely(p_workspace_id uuid, p_performing_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_name text;
  v_step text;
  v_error_message text;
BEGIN
  -- Get workspace name for logging
  SELECT name INTO v_workspace_name
  FROM workspaces
  WHERE id = p_workspace_id;
  
  -- Start transaction (automatic in PostgreSQL function)
  
  -- Step 1: Orders (primary key is "Order ID" with space)
  v_step := 'orders';
  
  -- Delete order_items first (if exists and has workspace_id)
  BEGIN
    DELETE FROM order_items WHERE order_id IN (SELECT "Order ID" FROM orders WHERE workspace_id = p_workspace_id);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Delete shipments (if exists and has workspace_id)
  BEGIN
    DELETE FROM shipments WHERE order_id IN (SELECT "Order ID" FROM orders WHERE workspace_id = p_workspace_id);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Delete orders (if exists and has workspace_id)
  BEGIN
    DELETE FROM orders WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 2: Customers
  v_step := 'customers';
  BEGIN
    DELETE FROM customers WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 3: Products
  v_step := 'products';
  
  -- Delete inventory first (if exists and has workspace_id)
  BEGIN
    DELETE FROM inventory WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Delete products (if exists and has workspace_id)
  BEGIN
    DELETE FROM products WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 4: Campaigns
  v_step := 'campaigns';
  BEGIN
    DELETE FROM campaigns WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 5: Expenses
  v_step := 'expenses';
  BEGIN
    DELETE FROM expenses WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 6: Integrations
  v_step := 'integrations';
  
  -- Delete integration_status first (if exists and has workspace_id)
  BEGIN
    DELETE FROM integration_status WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Delete integrations (if exists and has workspace_id)
  BEGIN
    DELETE FROM integrations WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 7: Google Sheet mappings
  v_step := 'google_sheet_mappings';
  
  BEGIN
    DELETE FROM workspace_google_sheet_mapping WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_google_sheet_sync WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_google_sheet_sync_log WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM google_sheet_column_mappings WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Delete Google Sheets credentials (new integration)
  BEGIN
    DELETE FROM google_sheets_credentials WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Delete Google Sheets order counter (resets GS numbering)
  BEGIN
    DELETE FROM google_sheets_order_counters WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 8: Shipping tables
  v_step := 'shipping';
  
  BEGIN
    DELETE FROM workspace_shipping_providers WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM shipping_provider_credentials WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM shipping_provider_status WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM shipping_sync_logs WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 9: Meta integration
  v_step := 'meta';
  
  BEGIN
    DELETE FROM meta_settings WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM meta_campaigns WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM meta_ads_daily WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 10: YouCan integration
  v_step := 'youcan';
  BEGIN
    DELETE FROM youcan_tokens WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 11: Team invitations
  v_step := 'invitations';
  BEGIN
    DELETE FROM team_invitations WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 12: Notifications
  v_step := 'notifications';
  BEGIN
    DELETE FROM notifications WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 13: Performance data
  v_step := 'performance';
  
  BEGIN
    DELETE FROM performance_badges WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM team_audit_log WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 14: Financial data
  v_step := 'financial';
  
  BEGIN
    DELETE FROM workspace_invoices WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM ad_spend WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM cod_scenarios WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 14.5: Assorted additional modules (AI, Tools, WhatsApp, Advanced Shipping, CRM, logs, etc)
  v_step := 'additional_modules';
  
  -- 1. AI and Tools
  BEGIN DELETE FROM ai_sawty_generations WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ai_products WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ai_landing_pages WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ai_generation_jobs WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM sawty_scripts WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM landing_pages WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ai_usage_logs WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM tool_api_usage_logs WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- 2. Team & CRM & Confirmation
  BEGIN DELETE FROM team_member_profiles WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM order_assignments WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM member_activity_log WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM agent_presence WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM confirmation_activities WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM confirmation_notes WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM confirmation_callbacks WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM confirmation_call_recordings WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- 3. Log & Audit
  BEGIN DELETE FROM activity_logs WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM error_logs WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM security_logs WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM api_usage_logs WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_exports WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM shipping_logs WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM order_events WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- 4. Integrations & Third-Party
  BEGIN DELETE FROM whatsapp_settings WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_queue WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_messages WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_forcelog_integrations WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM forcelog_cities WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_sendit_integrations WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM sendit_parcel_creation_locks WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_ameex_integrations WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ameex_city_mappings WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ameex_parcel_creation_locks WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM shipping_provider_cities WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM city_mappings WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM youcan_credentials WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_subscriptions WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM founder_support_sessions WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM support_tickets WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM founder_announcements WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- 5. Finance & Stock
  BEGIN DELETE FROM transactions WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM shipping_payouts WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM stock_history WHERE workspace_id = p_workspace_id; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Step 15: Reset workspace settings to defaults (only basic columns)
  v_step := 'workspace_settings';
  
  -- Try to reset basic columns one by one with exception handling
  BEGIN
    UPDATE workspaces SET google_sheet_url = NULL WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  BEGIN
    UPDATE workspaces SET google_sheet_autosync = false WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  BEGIN
    UPDATE workspaces SET shipping_enabled = true WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  BEGIN
    UPDATE workspaces SET show_shipping_column = false WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  BEGIN
    UPDATE workspaces SET carrier = 'ozon' WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', p_workspace_id,
    'workspace_name', v_workspace_name,
    'timestamp', NOW()
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback happens automatically in PostgreSQL function
    v_error_message := SQLERRM;
    
    -- Return error
    RETURN jsonb_build_object(
      'success', false,
      'error', v_error_message,
      'failed_step', v_step,
      'workspace_id', p_workspace_id
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION reset_workspace_completely TO authenticated;
