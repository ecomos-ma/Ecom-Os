-- ============================================================
-- OPTIONAL: MIGRATE EXISTING YOUCAN ORDER NUMBERS
-- ============================================================
-- ⚠️  READ BEFORE RUNNING:
-- 
-- This script is OPTIONAL and should ONLY be run if you are certain that:
-- 1. No external shipping providers (Ozon, Coliaty, Ameex, Sendit) reference existing order numbers
-- 2. No integrations or webhooks depend on current order number format
-- 3. No logs or analytics systems track order numbers
-- 4. You have a full database backup
-- 
-- If ANY of the above conditions are not met, DO NOT run this script.
-- The new sequential numbering system will work fine alongside existing long order numbers.
-- 
-- What this does:
-- - Renames existing YouCan orders from long format (#YC-d57a7b5e-ee19-4090-acf2-e887b06efc9a)
--   to sequential format (YC-1, YC-2, YC-3, etc.) within each workspace
-- - Orders are renumbered chronologically by created_at
-- - Preserves youcan_order_id and all other data
-- 
-- ============================================================

-- Migration function to renumber existing YouCan orders per workspace
CREATE OR REPLACE FUNCTION migrate_youcan_order_numbers()
RETURNS TABLE(workspace_id uuid, renamed_count int, error_message text) AS $$
DECLARE
  workspace_record RECORD;
  orders_to_rename RECORD;
  sequence_number integer;
  v_error_message text;
BEGIN
  -- Loop through each workspace that has YouCan orders
  FOR workspace_record IN 
    SELECT DISTINCT workspace_id 
    FROM public.orders 
    WHERE source = 'youcan' 
      AND order_number LIKE '#YC-%'
      AND order_number ~ '#YC-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' -- Only migrate UUID format numbers
  LOOP
    BEGIN
      -- Initialize counter for this workspace
      sequence_number := 1;
      
      -- Get existing counter value or start from max existing sequential number
      SELECT COALESCE(MAX(next_sequence_number), 1) INTO sequence_number
      FROM public.youcan_order_counters
      WHERE workspace_id = workspace_record.workspace_id;
      
      -- Renumber orders chronologically
      FOR orders_to_rename IN
        SELECT "Order ID", order_number, created_at, youcan_order_id
        FROM public.orders
        WHERE workspace_id = workspace_record.workspace_id
          AND source = 'youcan'
          AND order_number LIKE '#YC-%'
          AND order_number ~ '#YC-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' -- Only UUID format numbers
        ORDER BY created_at ASC
      LOOP
        -- Update order number to sequential format
        UPDATE public.orders
        SET order_number = 'YC-' || sequence_number::text
        WHERE "Order ID" = orders_to_rename."Order ID";
        
        sequence_number := sequence_number + 1;
      END LOOP;
      
      -- Update the counter to the final sequence number
      INSERT INTO public.youcan_order_counters (workspace_id, next_sequence_number)
      VALUES (workspace_record.workspace_id, sequence_number)
      ON CONFLICT (workspace_id)
      DO UPDATE SET next_sequence_number = sequence_number;
      
      -- Return success for this workspace
      RETURN QUERY SELECT 
        workspace_record.workspace_id, 
        sequence_number - 1 as renamed_count,
        NULL::text as error_message;
        
    EXCEPTION WHEN OTHERS THEN
      v_error_message := SQLERRM;
      RETURN QUERY SELECT 
        workspace_record.workspace_id, 
        0 as renamed_count,
        v_error_message as error_message;
    END;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Comment with usage instructions
COMMENT ON FUNCTION migrate_youcan_order_numbers IS 
'Optional migration function to renumber existing YouCan orders from UUID format to sequential format.
WARNING: Only run if you are certain no external systems depend on current order numbers.
Usage: SELECT * FROM migrate_youcan_order_numbers();';

-- ============================================================
-- TO RUN THE MIGRATION (UNCOMMENT AND EXECUTE):
-- ============================================================
-- SELECT * FROM migrate_youcan_order_numbers();

-- ============================================================
-- TO VERIFY MIGRATION RESULTS:
-- ============================================================
-- Check a few workspaces to see the new order numbers:
-- SELECT workspace_id, order_number, youcan_order_id, created_at 
-- FROM orders 
-- WHERE source = 'youcan' 
-- ORDER BY workspace_id, created_at 
-- LIMIT 20;

-- Check for any remaining UUID format numbers:
-- SELECT workspace_id, COUNT(*) as remaining_uuid_numbers
-- FROM orders 
-- WHERE source = 'youcan' 
--   AND order_number ~ '#YC-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
-- GROUP BY workspace_id;