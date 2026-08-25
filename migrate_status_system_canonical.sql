-- ============================================================
-- DATABASE MIGRATION: Complete Status System Refactor
-- Normalizes all statuses to canonical keys and adds language support
-- ============================================================

-- Step 1: Add status_language column to workspaces table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workspaces' 
    AND column_name = 'status_language'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN status_language VARCHAR(2) DEFAULT 'en';
    ALTER TABLE workspaces ALTER COLUMN status_language SET NOT NULL;
    RAISE NOTICE 'Added status_language column to workspaces table';
  END IF;
END $$;

-- Step 2: Create status normalization function
CREATE OR REPLACE FUNCTION normalize_status_to_canonical(raw_status TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Handle NULL
  IF raw_status IS NULL THEN
    RETURN 'pending';
  END IF;
  
  -- Convert to uppercase for comparison
  CASE UPPER(TRIM(raw_status))
    -- English variations
    WHEN 'PENDING', 'PENDING ', 'PENDING ORDER' THEN
      RETURN 'pending';
    WHEN 'CONFIRMED', 'CONFIRMED ' THEN
      RETURN 'confirmed';
    WHEN 'SHIPPED', 'SHIPPED ' THEN
      RETURN 'shipped';
    WHEN 'DELIVERED', 'DELIVERED ' THEN
      RETURN 'delivered';
    WHEN 'RETURNED', 'RETURNED ' THEN
      RETURN 'returned';
    WHEN 'CANCELLED', 'CANCELED', 'CANCELLED ', 'CANCELED ' THEN
      RETURN 'cancelled';
    WHEN 'NO ANSWER', 'NO ANSWER ' THEN
      RETURN 'no_answer';
    WHEN 'SCHEDULED', 'SCHEDULED ' THEN
      RETURN 'scheduled';
    WHEN 'BLACKLISTED', 'BLACKLISTED ', 'BLACKLIST', 'BLACKLIST ' THEN
      RETURN 'blacklisted';
    WHEN 'DUPLICATE', 'DUPLICATE ', 'DOUBLE', 'DOUBLE ' THEN
      RETURN 'duplicate';
    WHEN 'UNREACHABLE', 'UNREACHABLE ' THEN
      RETURN 'unreachable';
    WHEN 'WRONG NUMBER', 'WRONG NUMBER ' THEN
      RETURN 'wrong_number';
    WHEN 'OUT OF STOCK', 'OUT OF STOCK ', 'OUT_OF_STOCK', 'OUT_OF_STOCK ' THEN
      RETURN 'out_of_stock';
    WHEN 'REFUSED', 'REFUSED ' THEN
      RETURN 'refused';
    WHEN 'NEW', 'NEW ' THEN
      RETURN 'new';
    
    -- French variations
    WHEN 'EN ATTENTE', 'EN ATTENTE ' THEN
      RETURN 'pending';
    WHEN 'CONFIRMÉ', 'CONFIRME', 'CONFIRMÉ ', 'CONFIRME ' THEN
      RETURN 'confirmed';
    WHEN 'EXPÉDIÉ', 'EXPEDIE', 'EXPÉDIÉ ', 'EXPEDIE ' THEN
      RETURN 'shipped';
    WHEN 'LIVRÉ', 'LIVRE', 'LIVRÉ ', 'LIVRE ' THEN
      RETURN 'delivered';
    WHEN 'RETOURNÉ', 'RETOURNE', 'RETOURNÉ ', 'RETOURNE ' THEN
      RETURN 'returned';
    WHEN 'ANNULÉ', 'ANNULE', 'ANNULÉ ', 'ANNULE ' THEN
      RETURN 'cancelled';
    WHEN 'PAS DE RÉPONSE', 'PAS DE REPONSE', 'PAS DE RÉPONSE ', 'PAS DE REPONSE ' THEN
      RETURN 'no_answer';
    WHEN 'REPORTÉ', 'REPORTE', 'REPORTÉ ', 'REPORTE ' THEN
      RETURN 'scheduled';
    WHEN 'BLACKLISTÉ', 'BLACKLISTE', 'BLACKLISTÉ ', 'BLACKLISTE ' THEN
      RETURN 'blacklisted';
    WHEN 'DOUBLON', 'DOUBLON ' THEN
      RETURN 'duplicate';
    WHEN 'INJOIGNABLE', 'INJOIGNABLE ' THEN
      RETURN 'unreachable';
    WHEN 'MAUVAIS NUMÉRO', 'MAUVAIS NUMERO', 'MAUVAIS NUMÉRO ', 'MAUVAIS NUMERO ' THEN
      RETURN 'wrong_number';
    WHEN 'PRODUIT INDISPONIBLE', 'PRODUIT INDISPONIBLE ' THEN
      RETURN 'out_of_stock';
    WHEN 'REFUSÉ', 'REFUSE', 'REFUSÉ ', 'REFUSE ' THEN
      RETURN 'refused';
    WHEN 'NOUVEAU', 'NOUVEAU ' THEN
      RETURN 'new';
    
    -- Additional common variations
    WHEN 'VOICEMAIL', 'BOITE VOCALE', 'BOÎTE VOCALE', 'MESSAGERIE' THEN
      RETURN 'no_answer';
    WHEN 'CALLBACK', 'CALL BACK', 'RAPPEL' THEN
      RETURN 'scheduled';
    WHEN 'TRAVELLING', 'TRAVELING', 'EN DÉPLACEMENT', 'EN DEPLACEMENT', 'EN VOYAGE' THEN
      RETURN 'scheduled';
    WHEN 'POSTPONED', 'POSTPONED ' THEN
      RETURN 'scheduled';
    WHEN 'UNAVAILABLE', 'INDISPONIBLE', 'INDISPONIBLE ' THEN
      RETURN 'unreachable';
    
    -- Default to pending for unknown statuses
    ELSE
      RETURN 'pending';
  END CASE;
END;
$$;

-- Step 3: Normalize orders table
UPDATE orders
SET status = normalize_status_to_canonical(status)
WHERE status IS NOT NULL;

RAISE NOTICE 'Normalized orders table: % rows updated', ROW_COUNT;

-- Step 4: Normalize shipments table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'shipments'
  ) THEN
    UPDATE shipments
    SET status = normalize_status_to_canonical(status)
    WHERE status IS NOT NULL;
    RAISE NOTICE 'Normalized shipments table';
  END IF;
END $$;

-- Step 5: Create index on canonical status for better performance
CREATE INDEX IF NOT EXISTS idx_orders_status_canonical ON orders(status);

-- Step 6: Add constraint to ensure only canonical status values
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND constraint_name = 'check_orders_status_canonical'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT check_orders_status_canonical;
  END IF;
  
  -- Add new constraint
  ALTER TABLE orders
  ADD CONSTRAINT check_orders_status_canonical
  CHECK (status IN (
    'pending', 'confirmed', 'shipped', 'delivered', 'returned', 
    'cancelled', 'no_answer', 'scheduled', 'blacklisted', 'duplicate', 
    'unreachable', 'wrong_number', 'out_of_stock', 'refused', 'new'
  ));
  
  RAISE NOTICE 'Added canonical status constraint to orders table';
END $$;

-- Step 7: Drop the temporary function
DROP FUNCTION IF EXISTS normalize_status_to_canonical;

-- Step 8: Success message
DO $$
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Status system migration completed successfully';
  RAISE NOTICE '===========================================';
  RAISE NOTICE '✓ Added status_language column to workspaces';
  RAISE NOTICE '✓ Normalized all statuses to canonical keys';
  RAISE NOTICE '✓ Added canonical status constraint';
  RAISE NOTICE '✓ Created index on status column';
  RAISE NOTICE '===========================================';
END $$;
