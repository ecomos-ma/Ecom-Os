-- Verification Query: Show data counts before running workspace reset
DO $$
DECLARE
    -- If you want to test a specific workspace, paste its ID here, otherwise we pick one automatically.
    target_workspace UUID := (SELECT id FROM workspaces LIMIT 1);
    v_table TEXT;
    v_count INT;
    v_total_records INT := 0;
    
    tables_to_check TEXT[] := ARRAY[
        'orders',
        'order_items',
        'customers',
        'products',
        'shipments',
        'expenses',
        'integrations',
        'whatsapp_messages',
        'meta_campaigns',
        'ai_usage_logs',
        'workspace_ameex_integrations'
    ];
BEGIN
    RAISE INFO '==== WORKSPACE RESET AUDIT ====';
    RAISE INFO 'Checking workspace: %', target_workspace;
    
    FOREACH v_table IN ARRAY tables_to_check LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_table) THEN
            EXECUTE format('SELECT count(*) FROM %I WHERE workspace_id = $1', v_table)
            INTO v_count
            USING target_workspace;
            
            RAISE INFO '%: % records', RPAD(v_table, 30), v_count;
            v_total_records := v_total_records + v_count;
        ELSE
            RAISE INFO '%: (Table not deployed/exists)', RPAD(v_table, 30);
        END IF;
    END LOOP;
    
    RAISE INFO '-------------------------------';
    RAISE INFO 'Total Operational Records to Reset: %', v_total_records;
END;
$$;
