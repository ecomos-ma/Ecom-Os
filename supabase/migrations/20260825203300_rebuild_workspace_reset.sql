-- Migration: Rebuild Secure Workspace Reset
-- Drops legacy reset RPCs and establishes a new secure, completely scoped reset function.

-- 1. Drop Legacy Functions
DROP FUNCTION IF EXISTS reset_workspace_v2 CASCADE;
DROP FUNCTION IF EXISTS reset_workspace_simple CASCADE;
DROP FUNCTION IF EXISTS reset_workspace_completely CASCADE;
DROP FUNCTION IF EXISTS initialize_workspace_reset CASCADE;
DROP FUNCTION IF EXISTS finalize_workspace_reset CASCADE;

-- 2. Create the New Reset Procedure
CREATE OR REPLACE FUNCTION reset_workspace_data(p_workspace_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_owner_id UUID;
    v_caller_id UUID;
BEGIN
    -- 1. Security Check: Caller must be authenticated
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Identify the Workspace Owner
    SELECT owner_id INTO v_owner_id
    FROM workspaces
    WHERE id = p_workspace_id;

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Workspace not found';
    END IF;

    IF v_caller_id != v_owner_id THEN
        RAISE EXCEPTION 'Forbidden: only the workspace owner can reset it';
    END IF;

    ---------------------------------------------------------------------------
    -- SAFE DELETION CHAIN (Child to Parent, strict p_workspace_id conditions)
    ---------------------------------------------------------------------------

    -- I. Ads & Social Integration Logs
    DELETE FROM meta_ads_daily WHERE workspace_id = p_workspace_id;
    DELETE FROM meta_campaigns WHERE workspace_id = p_workspace_id;
    DELETE FROM meta_settings WHERE workspace_id = p_workspace_id;

    DELETE FROM tiktok_event_logs WHERE workspace_id = p_workspace_id;
    DELETE FROM tiktok_click_attributions WHERE workspace_id = p_workspace_id;
    DELETE FROM tiktok_events_config WHERE workspace_id = p_workspace_id;

    DELETE FROM ad_spend WHERE workspace_id = p_workspace_id;
    DELETE FROM campaigns WHERE workspace_id = p_workspace_id;

    -- II. Workbooks & Sheet Automations
    DELETE FROM workspace_google_sheet_sync_log WHERE workspace_id = p_workspace_id;
    DELETE FROM google_sheet_column_mappings WHERE workspace_id = p_workspace_id;
    DELETE FROM workspace_google_sheet_mapping WHERE workspace_id = p_workspace_id;
    DELETE FROM google_sheets_credentials WHERE workspace_id = p_workspace_id;
    DELETE FROM google_sheets_order_counters WHERE workspace_id = p_workspace_id;
    DELETE FROM workspace_google_sheet_sync WHERE workspace_id = p_workspace_id;

    -- III. Other Integrations (YouCan, etc)
    DELETE FROM youcan_order_counters WHERE workspace_id = p_workspace_id;
    DELETE FROM youcan_tokens WHERE workspace_id = p_workspace_id;
    DELETE FROM youcan_credentials WHERE workspace_id = p_workspace_id;

    -- IV. Notifications
    DELETE FROM notification_deliveries WHERE workspace_id = p_workspace_id;
    DELETE FROM notification_outbox WHERE workspace_id = p_workspace_id;
    DELETE FROM push_subscriptions WHERE workspace_id = p_workspace_id;
    DELETE FROM notifications WHERE workspace_id = p_workspace_id;
    DELETE FROM notification_thresholds WHERE workspace_id = p_workspace_id;
    DELETE FROM notification_preferences WHERE workspace_id = p_workspace_id;
    DELETE FROM notification_user_settings WHERE workspace_id = p_workspace_id;
    DELETE FROM user_notifications WHERE workspace_id = p_workspace_id;

    -- V. Team & Activities
    DELETE FROM team_audit_log WHERE workspace_id = p_workspace_id;
    DELETE FROM member_activity_log WHERE workspace_id = p_workspace_id;
    DELETE FROM agent_presence WHERE workspace_id = p_workspace_id;
    DELETE FROM workspace_invitations WHERE workspace_id = p_workspace_id;
    -- Note: Keep workspace_members for owner, but remove others if needed.
    -- The prompt asked to remove other members, so:
    DELETE FROM workspace_members WHERE workspace_id = p_workspace_id AND user_id != v_owner_id;
    DELETE FROM team_member_profiles WHERE workspace_id = p_workspace_id;

    -- VI. eCommerce Core Data (Orders, Customers, Shipments)
    -- Need to resolve parent-child relationship where necessary (though most have workspace_id).
    DELETE FROM order_items WHERE workspace_id = p_workspace_id;
    DELETE FROM shipments WHERE workspace_id = p_workspace_id;
    DELETE FROM cod_scenarios WHERE workspace_id = p_workspace_id;
    DELETE FROM orders WHERE workspace_id = p_workspace_id;
    DELETE FROM customers WHERE workspace_id = p_workspace_id;

    -- VII. Inventory & Products
    DELETE FROM stock_history WHERE workspace_id = p_workspace_id;
    DELETE FROM products WHERE workspace_id = p_workspace_id;

    -- VIII. Finance
    DELETE FROM shipping_payouts WHERE workspace_id = p_workspace_id;
    DELETE FROM transactions WHERE workspace_id = p_workspace_id;
    DELETE FROM expenses WHERE workspace_id = p_workspace_id;

    -- Cleanup any other integrations via webhooks
    DELETE FROM webhooks WHERE workspace_id = p_workspace_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Workspace data completely reset'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION reset_workspace_data TO authenticated;
