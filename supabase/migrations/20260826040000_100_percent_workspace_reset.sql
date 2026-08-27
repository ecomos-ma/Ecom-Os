-- supabase/migrations/20260826040000_100_percent_workspace_reset.sql

CREATE OR REPLACE FUNCTION public.reset_workspace_data(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_authorized BOOLEAN := false;
    v_col        TEXT;
    v_table      TEXT;
    v_sql        TEXT;
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

    -- ── 2. NULL out integration columns on workspaces ─────────────────────────
    -- Use dynamic EXECUTE to completely avoid compilation errors if columns change.
    FOR v_col IN 
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'workspaces' 
          AND column_name IN (
            'youcan_access_token','youcan_refresh_token','youcan_token_expires_at',
            'meta_access_token','meta_ad_account_id',
            'ozon_api_key','ozon_client_id','ozon_warehouse_id',
            'coliaty_api_key','coliaty_public_key','coliaty_secret_key','coliaty_api_url',
            'google_sheet_url','shopify_access_token','shopify_refresh_token','shopify_shop_domain'
          )
    LOOP
        EXECUTE format('UPDATE public.workspaces SET %I = NULL WHERE id = $1', v_col) USING p_workspace_id;
    END LOOP;

    FOR v_col IN 
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'workspaces' 
          AND column_name IN ('coliaty_enabled','google_sheet_autosync','shopify_enabled')
    LOOP
        EXECUTE format('UPDATE public.workspaces SET %I = false WHERE id = $1', v_col) USING p_workspace_id;
    END LOOP;

    -- ── 3. STRICT DYNAMIC FK-SAFE DELETION ──────────────────────────────────
    -- We dynamically build a topological topological sort of all workspace tables.
    FOR v_table IN
        WITH RECURSIVE fk_graph AS (
            SELECT 
                kcu.table_name::text, 
                ccu.table_name::text AS referenced_table_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public'
              AND ccu.table_schema = 'public'
        ),
        target_tables AS (
            SELECT table_name::text
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND column_name = 'workspace_id'
              AND table_name NOT IN (
                'workspaces', 
                'profile_workspaces', 
                'team_member_profiles', 
                'workspace_invitations'
              )
        ),
        roots AS (
            SELECT t.table_name, 0 AS level
            FROM target_tables t
        ),
        hierarchy AS (
            SELECT table_name, level
            FROM roots

            UNION ALL

            SELECT f.table_name, h.level + 1
            FROM fk_graph f
            JOIN hierarchy h ON f.referenced_table_name = h.table_name
            WHERE h.level < 50
              AND f.table_name IN (SELECT table_name FROM target_tables)
        ),
        max_levels AS (
            SELECT table_name, MAX(level) AS depth
            FROM hierarchy
            GROUP BY table_name
        )
        SELECT table_name 
        FROM max_levels 
        ORDER BY depth DESC, table_name
    LOOP
        v_sql := format('DELETE FROM public.%I WHERE workspace_id = $1', v_table);
        EXECUTE v_sql USING p_workspace_id;
    END LOOP;

    -- ── 4. Storage cleanup ──────────────────────────────────────────────────
    -- Clear out standard storage buckets without hard crashing if not installed.
    -- (Storage schemas might differ or might not be exposed directly in all projects).
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'storage' AND table_name = 'objects'
        ) THEN
            EXECUTE 'DELETE FROM storage.objects WHERE bucket_id = ''profile-images'' AND (storage.foldername(name))[1] = $1' USING p_workspace_id::text;
            EXECUTE 'DELETE FROM storage.objects WHERE bucket_id = ''product-images'' AND (storage.foldername(name))[1] = $1' USING p_workspace_id::text;
            EXECUTE 'DELETE FROM storage.objects WHERE bucket_id = ''call-recordings'' AND (storage.foldername(name))[1] = $1' USING p_workspace_id::text;
            EXECUTE 'DELETE FROM storage.objects WHERE bucket_id = ''whatsapp-audio'' AND (storage.foldername(name))[1] = $1' USING p_workspace_id::text;
        END IF;
    EXCEPTION WHEN OTHERS THEN 
        -- Silently ignore storage issues during reset (often storage schema isn't fully readable to public definition functions without special roles)
    END;

END;
$function$;
