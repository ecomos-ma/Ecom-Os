-- ============================================================
-- FOUNDER WORKSPACE OVERVIEW RPC FUNCTION
-- ============================================================
-- Returns comprehensive workspace data for founder internal page
-- Protected by is_founder_internal_user() security check

CREATE OR REPLACE FUNCTION public.founder_get_workspace_overview()
RETURNS TABLE (
  workspace_id uuid,
  workspace_name text,
  created_at timestamptz,
  total_orders bigint,
  total_revenue numeric,
  active_integrations jsonb,
  last_activity timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  original_setting text;
BEGIN
  -- Security check
  IF NOT public.is_founder_internal_user() THEN
    RAISE EXCEPTION 'Unauthorized: founder access required' USING ERRCODE = '42501';
  END IF;

  -- Save current RLS setting and disable it temporarily
  SELECT current_setting('app.settings.row_level_security', true) INTO original_setting;
  
  -- Disable RLS for this session
  PERFORM set_config('app.settings.row_level_security', 'false', true);
  
  RETURN QUERY
  SELECT 
    w.id as workspace_id,
    w.name as workspace_name,
    w.created_at,
    COALESCE(o.order_counts, 0) as total_orders,
    COALESCE(o.revenue_sum, 0) as total_revenue,
    COALESCE(i.integrations, '{}'::jsonb) as active_integrations,
    COALESCE(o.last_order_date, w.created_at) as last_activity
  FROM workspaces w
  LEFT JOIN LATERAL (
    SELECT 
      workspace_id,
      COUNT(*) as order_counts,
      SUM(CASE 
        WHEN shipping_status = 'delivered' OR delivery_status = 'delivered' OR status = 'delivered'
        THEN COALESCE(total, 0) 
        ELSE 0 
      END) as revenue_sum,
      MAX(created_at) as last_order_date
    FROM orders
    WHERE workspace_id = w.id
    GROUP BY workspace_id
  ) o ON true
  LEFT JOIN LATERAL (
    SELECT 
      workspace_id,
      jsonb_object_agg(
        provider, 
        CASE WHEN connected THEN true ELSE false END
      ) as integrations
    FROM (
      SELECT workspace_id, 'ozon' as provider, 
        COALESCE((SELECT COUNT(*) > 0 FROM ozon_credentials WHERE workspace_id = w.id), false) as connected
      UNION ALL
      SELECT workspace_id, 'ameex' as provider,
        COALESCE((SELECT COUNT(*) > 0 FROM ameex_credentials WHERE workspace_id = w.id), false) as connected
      UNION ALL
      SELECT workspace_id, 'sendit' as provider,
        COALESCE((SELECT COUNT(*) > 0 FROM sendit_credentials WHERE workspace_id = w.id), false) as connected
      UNION ALL
      SELECT workspace_id, 'youcan' as provider,
        COALESCE((SELECT COUNT(*) > 0 FROM youcan_credentials WHERE workspace_id = w.id), false) as connected
      UNION ALL
      SELECT workspace_id, 'whatsapp' as provider,
        COALESCE((SELECT COUNT(*) > 0 FROM whatsapp_credentials WHERE workspace_id = w.id), false) as connected
      UNION ALL
      SELECT workspace_id, 'shopify' as provider,
        COALESCE((SELECT COUNT(*) > 0 FROM shopify_credentials WHERE workspace_id = w.id), false) as connected
    ) creds
    WHERE workspace_id = w.id
    GROUP BY workspace_id
  ) i ON true
  ORDER BY w.created_at DESC;
  
  -- Restore original RLS setting
  IF original_setting IS NOT NULL THEN
    PERFORM set_config('app.settings.row_level_security', original_setting, true);
  END IF;
END;
$func$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.founder_get_workspace_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.founder_get_workspace_overview() TO anon;

-- Add comment
COMMENT ON FUNCTION public.founder_get_workspace_overview IS 
'Returns comprehensive workspace overview for founder internal page. Includes workspace info, order counts, revenue (from delivered orders only), active integrations, and last activity. Protected by is_founder_internal_user() security check.';
