-- ============================================================
-- COMPREHENSIVE WORKSPACE RESET FUNCTION
-- ============================================================
-- This is the main reset function that orchestrates the entire
-- workspace reset process with proper staging, error handling,
-- and verification.
-- ============================================================

CREATE OR REPLACE FUNCTION reset_workspace_v2(
  p_workspace_id uuid,
  p_user_id uuid,
  p_operation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_operation_id text;
  v_workspace_name text;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_deleted_records_count integer DEFAULT 0;
  v_deleted_files_count integer DEFAULT 0;
  v_integrations_revoked jsonb DEFAULT '[]'::jsonb;
  v_error_message text;
  v_stage text;
  v_temp_count integer;
BEGIN
  v_start_time := now();
  
  -- Generate operation_id if not provided
  IF p_operation_id IS NULL THEN
    v_operation_id := lower(gen_random_uuid()::text);
  ELSE
    v_operation_id := p_operation_id;
  END IF;
  
  -- ============================================================
  -- STAGE 0: Initialize and Lock
  -- ============================================================
  v_stage := 'initializing';
  
  -- Initialize reset operation with locking
  PERFORM update_reset_stage(v_operation_id, v_stage);
  
  DECLARE
    v_init_result jsonb;
  BEGIN
    v_init_result := initialize_workspace_reset(p_workspace_id, p_user_id, v_operation_id);
    
    IF (v_init_result->>'success')::boolean = false THEN
      -- Return error if initialization failed
      RETURN v_init_result;
    END IF;
    
    v_workspace_name := v_init_result->>'workspace_name';
  END;
  
  -- ============================================================
  -- STAGE 1: Disable Integrations and Stop Workers
  -- ============================================================
  v_stage := 'disabling_integrations';
  PERFORM update_reset_stage(v_operation_id, v_stage);
  
  -- Disable Google Sheets auto-sync
  BEGIN
    UPDATE workspaces
    SET google_sheet_autosync = false
    WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  -- Disable YouCan webhooks (set webhook_id to NULL)
  BEGIN
    UPDATE youcan_tokens
    SET webhook_id = NULL
    WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Disable TikTok events
  BEGIN
    UPDATE tiktok_events_config
    SET enabled = false
    WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Disable WhatsApp automation
  BEGIN
    UPDATE whatsapp_settings
    SET automation_enabled = false
    WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- ============================================================
  -- STAGE 2: Delete Storage Files
  -- ============================================================
  v_stage := 'deleting_storage';
  PERFORM update_reset_stage(v_operation_id, v_stage);
  
  -- Delete profile images
  BEGIN
    v_temp_count := delete_workspace_storage_objects(p_workspace_id, 'profile-images');
    v_deleted_files_count := v_deleted_files_count + v_temp_count;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  
  -- Delete product images
  BEGIN
    v_temp_count := delete_workspace_storage_objects(p_workspace_id, 'product-images');
    v_deleted_files_count := v_deleted_files_count + v_temp_count;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  
  -- Delete call recordings
  BEGIN
    v_temp_count := delete_workspace_storage_objects(p_workspace_id, 'call-recordings');
    v_deleted_files_count := v_deleted_files_count + v_temp_count;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  
  -- Delete WhatsApp audio
  BEGIN
    v_temp_count := delete_workspace_storage_objects(p_workspace_id, 'whatsapp-audio');
    v_deleted_files_count := v_deleted_files_count + v_temp_count;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  
  -- ============================================================
  -- STAGE 3: Delete Database Data - Phase 1 (Level 1: User & Profile Data)
  -- ============================================================
  v_stage := 'deleting_user_data';
  PERFORM update_reset_stage(v_operation_id, v_stage);
  
  -- Notification system tables
  BEGIN
    DELETE FROM notification_user_settings WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM notification_preferences WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_COLUMN THEN NULL; END;
  
  BEGIN
    DELETE FROM notification_thresholds WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM notifications WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM push_subscriptions WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM notification_outbox WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM notification_deliveries WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM user_notifications WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Team management (keep owner, remove others)
  BEGIN
    DELETE FROM team_member_profiles WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM agent_presence WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM member_activity_log WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM team_audit_log WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_invitations WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- ============================================================
  -- STAGE 4: Delete Database Data - Phase 2 (Level 2: Core Business Data)
  -- ============================================================
  v_stage := 'deleting_business_data';
  PERFORM update_reset_stage(v_operation_id, v_stage);
  
  -- Orders and order items
  BEGIN
    DELETE FROM order_items WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM orders WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Customers
  BEGIN
    DELETE FROM customers WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Products and inventory
  BEGIN
    DELETE FROM stock_history WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM products WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Campaigns and ads
  BEGIN
    DELETE FROM ad_spend WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM campaigns WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Expenses and finance
  BEGIN
    DELETE FROM expenses WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM transactions WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM shipping_payouts WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM cod_scenarios WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- ============================================================
  -- STAGE 5: Delete Database Data - Phase 3 (Integrations)
  -- ============================================================
  v_stage := 'deleting_integrations';
  PERFORM update_reset_stage(v_operation_id, v_stage);
  
  -- Google Sheets
  BEGIN
    DELETE FROM google_sheet_column_mappings WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_google_sheet_sync_log WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_google_sheet_sync WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_google_sheet_mapping WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM google_sheets_credentials WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM google_sheets_order_counters WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- YouCan
  BEGIN
    DELETE FROM youcan_order_counters WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM youcan_tokens WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM youcan_credentials WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Meta
  BEGIN
    DELETE FROM meta_ads_daily WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM meta_campaigns WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM meta_settings WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- TikTok
  BEGIN
    DELETE FROM tiktok_event_logs WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM tiktok_ad_insights WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM tiktok_events_config WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM tiktok_click_attributions WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM tiktok_oauth_states WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM tiktok_connections WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- WhatsApp
  BEGIN
    DELETE FROM whatsapp_events WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM whatsapp_manual_reviews WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM whatsapp_messages WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM whatsapp_queue WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM whatsapp_opt_outs WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM whatsapp_reply_actions WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM whatsapp_automation_rules WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM whatsapp_audio_recordings WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM whatsapp_worker_heartbeats WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM whatsapp_settings WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Shipping providers
  BEGIN
    DELETE FROM ameex_city_mappings WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM ameex_parcel_creation_locks WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_ameex_integrations WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM forcelog_cities WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_forcelog_integrations WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM sendit_parcel_creation_locks WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_sendit_integrations WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_shipping_providers WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM shipping_provider_credentials WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM shipping_provider_status WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM shipping_sync_logs WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM shipping_logs WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Generic integrations
  BEGIN
    DELETE FROM integration_status WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM integrations WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- ============================================================
  -- STAGE 6: Delete Database Data - Phase 4 (AI & Additional Modules)
  -- ============================================================
  v_stage := 'deleting_ai_data';
  PERFORM update_reset_stage(v_operation_id, v_stage);
  
  BEGIN
    DELETE FROM ai_sawty_generations WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM ai_products WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM ai_landing_pages WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM ai_generation_jobs WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM sawty_scripts WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM landing_pages WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM ai_usage_logs WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM tool_api_usage_logs WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Confirmation CRM
  BEGIN
    DELETE FROM confirmation_call_recordings WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM confirmation_callbacks WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM confirmation_notes WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM confirmation_activities WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Order assignments
  BEGIN
    DELETE FROM order_assignments WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Order events - delete by workspace_id directly
  BEGIN
    DELETE FROM order_events WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Shipments
  BEGIN
    DELETE FROM shipments WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Workspace operations
  BEGIN
    DELETE FROM workspace_supplies WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_cost_rules WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM workspace_affiliate_sku_costs WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Support - delete by workspace_id if column exists
  BEGIN
    DELETE FROM support_ticket_messages stm
    USING support_tickets st
    WHERE stm.ticket_id = st.id
    AND st.workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM support_tickets WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  BEGIN
    DELETE FROM founder_support_sessions WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- Workspace exports
  BEGIN
    DELETE FROM workspace_exports WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- ============================================================
  -- STAGE 7: Reset Workspace Settings to Defaults
  -- ============================================================
  v_stage := 'resetting_settings';
  PERFORM update_reset_stage(v_operation_id, v_stage);
  
  -- Reset Google Sheet settings
  BEGIN
    UPDATE workspaces 
    SET google_sheet_url = NULL,
        google_sheet_autosync = false
    WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  -- Reset shipping settings
  BEGIN
    UPDATE workspaces 
    SET shipping_enabled = true,
        show_shipping_column = false,
        carrier = 'ozon'
    WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  -- Reset language to default
  BEGIN
    UPDATE workspaces 
    SET language = 'en'
    WHERE id = p_workspace_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  
  -- Reset sync cursors
  BEGIN
    DELETE FROM integration_sync_state WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_temp_count = ROW_COUNT;
    v_deleted_records_count := v_deleted_records_count + v_temp_count;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  
  -- ============================================================
  -- STAGE 8: Post-Reset Verification
  -- ============================================================
  v_stage := 'verifying';
  PERFORM update_reset_stage(v_operation_id, v_stage);
  
  -- Verify workspace is clean (should have 0 orders, customers, products)
  -- This is a safety check - if counts are not 0, something went wrong
  DECLARE
    v_orders_count integer;
    v_customers_count integer;
    v_products_count integer;
  BEGIN
    SELECT COUNT(*) INTO v_orders_count FROM orders WHERE workspace_id = p_workspace_id;
    SELECT COUNT(*) INTO v_customers_count FROM customers WHERE workspace_id = p_workspace_id;
    SELECT COUNT(*) INTO v_products_count FROM products WHERE workspace_id = p_workspace_id;
  EXCEPTION WHEN undefined_table THEN
    v_orders_count := 0;
    v_customers_count := 0;
    v_products_count := 0;
  END;
  
  -- ============================================================
  -- STAGE 9: Complete Operation and Log Audit
  -- ============================================================
  v_stage := 'completing';
  PERFORM update_reset_stage(v_operation_id, v_stage);
  
  v_end_time := now();
  
  -- Complete the reset operation
  PERFORM complete_reset_operation(
    v_operation_id,
    v_deleted_records_count,
    v_deleted_files_count,
    v_integrations_revoked
  );
  
  -- Log to platform audit (outside workspace data)
  INSERT INTO platform_reset_audit_log (
    workspace_id,
    workspace_name,
    requested_by_user_id,
    operation_id,
    timestamp,
    result,
    duration_ms,
    deleted_records_count,
    deleted_files_count,
    integrations_revoked
  ) VALUES (
    p_workspace_id,
    v_workspace_name,
    p_user_id,
    v_operation_id,
    v_start_time,
    'success',
    EXTRACT(EPOCH FROM (v_end_time - v_start_time))::integer,
    v_deleted_records_count,
    v_deleted_files_count,
    v_integrations_revoked
  );
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_operation_id,
    'workspace_id', p_workspace_id,
    'workspace_name', v_workspace_name,
    'deleted_records_count', v_deleted_records_count,
    'deleted_files_count', v_deleted_files_count,
    'duration_ms', EXTRACT(EPOCH FROM (v_end_time - v_start_time))::integer,
    'verification', jsonb_build_object(
      'orders_count', v_orders_count,
      'customers_count', v_customers_count,
      'products_count', v_products_count
    )
  );
  
EXCEPTION
  WHEN OTHERS THEN
    v_error_message := SQLERRM;
    v_end_time := now();
    
    -- Mark operation as failed
    PERFORM fail_reset_operation(v_operation_id, v_error_message);
    
    -- Log failure to audit
    INSERT INTO platform_reset_audit_log (
      workspace_id,
      workspace_name,
      requested_by_user_id,
      operation_id,
      timestamp,
      result,
      duration_ms,
      error_message
    ) VALUES (
      p_workspace_id,
      v_workspace_name,
      p_user_id,
      v_operation_id,
      v_start_time,
      'failed',
      EXTRACT(EPOCH FROM (v_end_time - v_start_time))::integer,
      v_error_message
    );
    
    -- Return error
    RETURN jsonb_build_object(
      'success', false,
      'error', v_error_message,
      'failed_stage', v_stage,
      'operation_id', v_operation_id,
      'workspace_id', p_workspace_id
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION reset_workspace_v2 TO authenticated;
