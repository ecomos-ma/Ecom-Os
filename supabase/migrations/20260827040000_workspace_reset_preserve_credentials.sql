-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Workspace Reset (Preserves Integration Credentials)
-- 
-- CHANGES FROM PREVIOUS VERSION:
-- - PRESERVES youcan_tokens, youcan_credentials (OAuth tokens)
-- - PRESERVES google_sheets_credentials (Google Sheets setup)
-- - PRESERVES all integration columns on workspaces table
-- - PRESERVES whatsapp_settings, whatsapp_automation_rules, whatsapp_reply_actions (config)
-- - DELETES only operational data (orders, customers, messages, logs, etc.)
-- 
-- Authorization: Only workspace owners/founders/super_admins can reset
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.reset_workspace_data(uuid);

CREATE OR REPLACE FUNCTION public.reset_workspace_data(p_workspace_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_authorized BOOLEAN := false;
BEGIN
    -- ── 1. Authorization ──────────────────────────────────────────────────────
    SELECT true INTO v_authorized
    FROM   public.profile_workspaces
    WHERE  profile_id   = auth.uid()
      AND  workspace_id = p_workspace_id
      AND  is_owner     = true
    LIMIT 1;

    IF NOT COALESCE(v_authorized, false) THEN
        -- Fallback: workspace creator
        SELECT true INTO v_authorized
        FROM   public.workspaces
        WHERE  id = p_workspace_id AND created_by = auth.uid()
        LIMIT 1;
    END IF;

    IF NOT COALESCE(v_authorized, false) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    -- ── 2. INTEGRATION CREDENTIALS ARE NOW PRESERVED ────────────────────────
    -- We NO LONGER null out integration columns on workspaces table
    -- This preserves: YouCan tokens, Ozon/Coliaty keys, WhatsApp config, etc.
    -- NO CHANGE to workspaces table integration columns

    -- ── 3. STRICT FK-SAFE DELETION ORDER ─────────────────────────────────────
    -- Level 0: smallest leaf tables first (no FK to anything else we delete)
    IF to_regclass('public.confirmation_call_recordings') IS NOT NULL THEN
        DELETE FROM public.confirmation_call_recordings WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.confirmation_notes') IS NOT NULL THEN
        DELETE FROM public.confirmation_notes WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.confirmation_callbacks') IS NOT NULL THEN
        DELETE FROM public.confirmation_callbacks WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.confirmation_activities') IS NOT NULL THEN
        DELETE FROM public.confirmation_activities WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.order_events') IS NOT NULL THEN
        DELETE FROM public.order_events WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.order_assignments') IS NOT NULL THEN
        DELETE FROM public.order_assignments WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.order_items') IS NOT NULL THEN
        DELETE FROM public.order_items WHERE workspace_id = p_workspace_id;
    END IF;

    -- Level 1: shipments (references orders; must go before orders)
    IF to_regclass('public.shipping_sync_logs') IS NOT NULL THEN
        DELETE FROM public.shipping_sync_logs WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.shipping_logs') IS NOT NULL THEN
        DELETE FROM public.shipping_logs WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.shipping_payouts') IS NOT NULL THEN
        DELETE FROM public.shipping_payouts WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.shipments') IS NOT NULL THEN
        -- NULL out back-ref on orders first in case of circular FK
        IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='orders' AND column_name='shipment_id') THEN
            UPDATE public.orders SET shipment_id = NULL WHERE workspace_id = p_workspace_id;
        END IF;
        DELETE FROM public.shipments WHERE workspace_id = p_workspace_id;
    END IF;

    -- Level 2: orders (references customers; must go BEFORE customers)
    DELETE FROM public.orders WHERE workspace_id = p_workspace_id;

    -- Level 3: customers (now safe – orders are gone)
    DELETE FROM public.customers WHERE workspace_id = p_workspace_id;

    -- Level 4: products / inventory (no FK to orders or customers)
    IF to_regclass('public.workspace_supply_usage') IS NOT NULL THEN
        DELETE FROM public.workspace_supply_usage WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.workspace_supply_purchases') IS NOT NULL THEN
        DELETE FROM public.workspace_supply_purchases WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.workspace_supplies') IS NOT NULL THEN
        DELETE FROM public.workspace_supplies WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.workspace_affiliate_sku_costs') IS NOT NULL THEN
        DELETE FROM public.workspace_affiliate_sku_costs WHERE workspace_id = p_workspace_id;
    END IF;
    DELETE FROM public.products WHERE workspace_id = p_workspace_id;

    -- Level 5: finance / ads
    DELETE FROM public.expenses WHERE workspace_id = p_workspace_id;
    IF to_regclass('public.transactions') IS NOT NULL THEN
        DELETE FROM public.transactions WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.workspace_invoices') IS NOT NULL THEN
        DELETE FROM public.workspace_invoices WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.workspace_cost_rules') IS NOT NULL THEN
        DELETE FROM public.workspace_cost_rules WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.ad_spend') IS NOT NULL THEN
        DELETE FROM public.ad_spend WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.meta_campaigns') IS NOT NULL THEN
        DELETE FROM public.meta_campaigns WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.campaigns') IS NOT NULL THEN
        DELETE FROM public.campaigns WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.tiktok_ads') IS NOT NULL THEN
        DELETE FROM public.tiktok_ads WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.tiktok_adgroups') IS NOT NULL THEN
        DELETE FROM public.tiktok_adgroups WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.tiktok_campaigns') IS NOT NULL THEN
        DELETE FROM public.tiktok_campaigns WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.tiktok_ad_accounts') IS NOT NULL THEN
        DELETE FROM public.tiktok_ad_accounts WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.tiktok_connections') IS NOT NULL THEN
        DELETE FROM public.tiktok_connections WHERE workspace_id = p_workspace_id;
    END IF;

    -- Level 6: integrations (PRESERVE google_sheets_credentials, youcan_tokens, youcan_credentials)
    IF to_regclass('public.integration_sync_state') IS NOT NULL THEN
        DELETE FROM public.integration_sync_state WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.integrations') IS NOT NULL THEN
        DELETE FROM public.integrations WHERE workspace_id = p_workspace_id;
    END IF;
    -- NOTE: google_sheets_credentials is now PRESERVED (not deleted)
    -- NOTE: youcan_tokens and youcan_credentials are now PRESERVED (not deleted)
    IF to_regclass('public.tiktok_oauth_states') IS NOT NULL THEN
        DELETE FROM public.tiktok_oauth_states WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.workspace_ameex_integrations') IS NOT NULL THEN
        DELETE FROM public.workspace_ameex_integrations WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.workspace_forcelog_integrations') IS NOT NULL THEN
        DELETE FROM public.workspace_forcelog_integrations WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.workspace_sendit_integrations') IS NOT NULL THEN
        DELETE FROM public.workspace_sendit_integrations WHERE workspace_id = p_workspace_id;
    END IF;

    -- Level 7: notifications
    IF to_regclass('public.notification_outbox') IS NOT NULL THEN
        DELETE FROM public.notification_outbox WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.notification_preferences') IS NOT NULL THEN
        DELETE FROM public.notification_preferences WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.notification_thresholds') IS NOT NULL THEN
        DELETE FROM public.notification_thresholds WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.notification_user_settings') IS NOT NULL THEN
        DELETE FROM public.notification_user_settings WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.notifications') IS NOT NULL THEN
        DELETE FROM public.notifications WHERE workspace_id = p_workspace_id;
    END IF;

    -- Level 8: WhatsApp (PRESERVE config, DELETE data/logs)
    -- DELETE: operational data
    IF to_regclass('public.whatsapp_audio_recordings') IS NOT NULL THEN
        DELETE FROM public.whatsapp_audio_recordings WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.whatsapp_queue') IS NOT NULL THEN
        DELETE FROM public.whatsapp_queue WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
        DELETE FROM public.whatsapp_messages WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.whatsapp_events') IS NOT NULL THEN
        DELETE FROM public.whatsapp_events WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.whatsapp_opt_outs') IS NOT NULL THEN
        DELETE FROM public.whatsapp_opt_outs WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.whatsapp_manual_reviews') IS NOT NULL THEN
        DELETE FROM public.whatsapp_manual_reviews WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.whatsapp_worker_heartbeats') IS NOT NULL THEN
        DELETE FROM public.whatsapp_worker_heartbeats WHERE workspace_id = p_workspace_id;
    END IF;
    
    -- PRESERVE: configuration tables (not deleted)
    -- whatsapp_settings - connection config, message templates, automation settings
    -- whatsapp_automation_rules - automation rule configurations
    -- whatsapp_reply_actions - reply keyword configurations

    -- Level 9: AI / tools / logs
    IF to_regclass('public.ai_usage_logs') IS NOT NULL THEN
        DELETE FROM public.ai_usage_logs WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.tool_api_usage_logs') IS NOT NULL THEN
        DELETE FROM public.tool_api_usage_logs WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.ai_landing_pages') IS NOT NULL THEN
        DELETE FROM public.ai_landing_pages WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.ai_products') IS NOT NULL THEN
        DELETE FROM public.ai_products WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.ai_sawty_generations') IS NOT NULL THEN
        DELETE FROM public.ai_sawty_generations WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.ai_generation_jobs') IS NOT NULL THEN
        DELETE FROM public.ai_generation_jobs WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.sawty_scripts') IS NOT NULL THEN
        DELETE FROM public.sawty_scripts WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.activity_logs') IS NOT NULL THEN
        DELETE FROM public.activity_logs WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.stock_history') IS NOT NULL THEN
        DELETE FROM public.stock_history WHERE workspace_id = p_workspace_id;
    END IF;
    IF to_regclass('public.error_logs') IS NOT NULL THEN
        DELETE FROM public.error_logs WHERE workspace_id = p_workspace_id;
    END IF;

END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.reset_workspace_data(uuid) TO authenticated;