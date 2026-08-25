-- ============================================================
-- SIMPLE WORKSPACE RESET SYSTEM
-- ============================================================
-- A straightforward reset that doesn't use complex locking or operation tracking
-- Just deletes everything in a transaction with basic idempotency
-- ============================================================

-- Drop the complex system first
DROP FUNCTION IF EXISTS reset_workspace_v2 CASCADE;
DROP FUNCTION IF EXISTS initialize_workspace_reset CASCADE;
DROP FUNCTION IF EXISTS update_reset_stage CASCADE;
DROP FUNCTION IF EXISTS complete_reset_operation CASCADE;
DROP FUNCTION IF EXISTS fail_reset_operation CASCADE;
DROP FUNCTION IF EXISTS get_current_reset_operation CASCADE;
DROP FUNCTION IF EXISTS is_workspace_resetting CASCADE;
DROP FUNCTION IF EXISTS delete_workspace_storage_objects CASCADE;
DROP TABLE IF EXISTS workspace_reset_operations CASCADE;
DROP TABLE IF EXISTS platform_reset_audit_log CASCADE;

-- Remove workspace status column
ALTER TABLE workspaces DROP COLUMN IF EXISTS status;

-- ============================================================
-- SIMPLE RESET FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION reset_workspace_simple(p_workspace_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_name text;
  v_deleted_count integer DEFAULT 0;
  v_temp_count integer;
BEGIN
  -- Get workspace name
  SELECT name INTO v_workspace_name
  FROM workspaces
  WHERE id = p_workspace_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workspace not found');
  END IF;
  
  -- Step 1: Disable integrations
  BEGIN
    UPDATE workspaces SET google_sheet_autosync = false WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  BEGIN
    UPDATE youcan_tokens SET webhook_id = NULL WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    UPDATE tiktok_events_config SET enabled = false WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    UPDATE whatsapp_settings SET automation_enabled = false WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 2: Delete storage files
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = p_workspace_id::text;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_temp_count;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = p_workspace_id::text;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_temp_count;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'call-recordings'
    AND (storage.foldername(name))[1] = p_workspace_id::text;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_temp_count;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'whatsapp-audio'
    AND (storage.foldername(name))[1] = p_workspace_id::text;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_count := v_deleted_count + v_temp_count;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  
  -- Step 3: Delete workspace data (keep account/profile data)
  BEGIN DELETE FROM notification_user_settings WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM notification_preferences WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM notification_thresholds WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM notifications WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM push_subscriptions WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM notification_outbox WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM notification_deliveries WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM user_notifications WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  -- Keep team member profiles - just reset workspace team data
  BEGIN DELETE FROM agent_presence WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM member_activity_log WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM team_audit_log WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_invitations WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 4: Delete business data
  BEGIN DELETE FROM order_items WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM orders WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM customers WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM stock_history WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM products WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ad_spend WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM campaigns WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM expenses WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM transactions WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM shipping_payouts WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM cod_scenarios WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 5: Delete integrations
  BEGIN DELETE FROM google_sheet_column_mappings WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_google_sheet_sync_log WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_google_sheet_sync WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_google_sheet_mapping WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM google_sheets_credentials WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM google_sheets_order_counters WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM youcan_order_counters WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM youcan_tokens WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM youcan_credentials WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM meta_ads_daily WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM meta_campaigns WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM meta_settings WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM tiktok_event_logs WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM tiktok_ad_insights WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM tiktok_events_config WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM tiktok_click_attributions WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM tiktok_oauth_states WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM tiktok_connections WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_events WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_manual_reviews WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_messages WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_queue WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_opt_outs WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_reply_actions WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_automation_rules WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_audio_recordings WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_worker_heartbeats WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM whatsapp_settings WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ameex_city_mappings WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ameex_parcel_creation_locks WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_ameex_integrations WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM forcelog_cities WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_forcelog_integrations WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM sendit_parcel_creation_locks WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_sendit_integrations WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_shipping_providers WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM shipping_provider_credentials WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM shipping_provider_status WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM shipping_sync_logs WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM shipping_logs WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM integration_status WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM integrations WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 6: Delete AI data
  BEGIN DELETE FROM ai_sawty_generations WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ai_products WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ai_landing_pages WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ai_generation_jobs WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM sawty_scripts WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM landing_pages WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM ai_usage_logs WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM tool_api_usage_logs WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 7: Delete confirmation CRM
  BEGIN DELETE FROM confirmation_call_recordings WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM confirmation_callbacks WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM confirmation_notes WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM confirmation_activities WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM order_assignments WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM order_events WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM shipments WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 8: Delete workspace operations
  BEGIN DELETE FROM workspace_supplies WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_cost_rules WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_affiliate_sku_costs WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM support_ticket_messages stm USING support_tickets st WHERE stm.ticket_id = st.id AND st.workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM support_tickets WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM founder_support_sessions WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM workspace_exports WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Step 9: Reset workspace settings to defaults
  BEGIN
    UPDATE workspaces 
    SET google_sheet_url = NULL,
        google_sheet_autosync = false,
        shipping_enabled = true,
        show_shipping_column = false,
        carrier = 'ozon',
        language = 'en'
    WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  -- Step 10: Reset sync cursors
  BEGIN DELETE FROM integration_sync_state WHERE workspace_id = p_workspace_id; GET DIAGNOSTICS v_temp_count = ROW_COUNT; v_deleted_count := v_deleted_count + v_temp_count; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', p_workspace_id,
    'workspace_name', v_workspace_name,
    'deleted_records_count', v_deleted_count
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION reset_workspace_simple TO authenticated;
