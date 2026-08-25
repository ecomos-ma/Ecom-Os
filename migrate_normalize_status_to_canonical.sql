-- ============================================================
-- DATABASE MIGRATION: Normalize Order Statuses to Canonical Keys
-- Converts all existing status variations to canonical keys
-- ============================================================

-- Add status_language column to workspaces table
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
  END IF;
END $$;

-- Create a temporary function to normalize status
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
    -- French variations
    WHEN 'CONFIRME', 'CONFIRMÉ', 'CONFIRME ', 'CONFIRMÉ ' THEN
      RETURN 'confirmed';
    WHEN 'PAS DE REPONSE', 'PAS DE RÉPONSE', 'PAS DE REPONSE ', 'PAS DE RÉPONSE ' THEN
      RETURN 'no_answer';
    WHEN 'LIVRE', 'LIVRÉ', 'LIVRE ', 'LIVRÉ ' THEN
      RETURN 'delivered';
    WHEN 'ANNULÉ', 'ANNULE', 'ANNULÉ ', 'ANNULE ' THEN
      RETURN 'cancelled';
    WHEN 'EXPÉDIÉ', 'EXPEDIE', 'EXPÉDIÉ ', 'EXPEDIE ' THEN
      RETURN 'shipped';
    WHEN 'EN ATTENTE', 'EN ATTENTE ' THEN
      RETURN 'pending';
    WHEN 'PAYÉ', 'PAYE', 'PAYÉ ', 'PAYE ' THEN
      RETURN 'paid';
    WHEN 'RETOURNÉ', 'RETOUNE', 'RETOURNÉ ', 'RETOUNE ' THEN
      RETURN 'returned';
    WHEN 'REFUSÉ', 'REFUSE', 'REFUSÉ ', 'REFUSE ' THEN
      RETURN 'refused';
    WHEN 'BOITE VOCAL', 'BOÎTE VOCAL', 'MESSAGERIE' THEN
      RETURN 'voicemail';
    WHEN 'RAPPELER PLUSTAD', 'RAPPELER PLUS TARD', 'RÉAPPEL' THEN
      RETURN 'callback';
    WHEN 'CLIENT PAS SÉRIEUX', 'CLIENT PAS SERIEUX' THEN
      RETURN 'blacklisted';
    WHEN 'INJOIGNABLE' THEN
      RETURN 'unreachable';
    WHEN 'EN DÉPLACEMENT', 'EN DEPLACEMENT', 'EN VOYAGE' THEN
      RETURN 'travelling';
    WHEN 'REPORTÉ', 'REPORTE', 'REPORTÉ ', 'REPORTE ' THEN
      RETURN 'postponed';
    WHEN 'INDISPONIBLE' THEN
      RETURN 'unavailable';
    WHEN 'DOUBLON', 'DUPLICATE' THEN
      RETURN 'duplicate';
    WHEN 'PLANIFIÉ', 'PLANIFIE' THEN
      RETURN 'scheduled';
    
    -- English variations
    WHEN 'CONFIRMED', 'CONFIRMED ' THEN
      RETURN 'confirmed';
    WHEN 'NO ANSWER', 'NO ANSWER ' THEN
      RETURN 'no_answer';
    WHEN 'DELIVERED', 'DELIVERED ' THEN
      RETURN 'delivered';
    WHEN 'CANCELLED', 'CANCELED', 'CANCELLED ', 'CANCELED ' THEN
      RETURN 'cancelled';
    WHEN 'SHIPPED', 'SHIPPED ' THEN
      RETURN 'shipped';
    WHEN 'PENDING', 'PENDING ' THEN
      RETURN 'pending';
    WHEN 'PAID', 'PAID ' THEN
      RETURN 'paid';
    WHEN 'RETURNED', 'RETURNED ' THEN
      RETURN 'returned';
    WHEN 'REFUSED', 'REFUSED ' THEN
      RETURN 'refused';
    WHEN 'VOICEMAIL', 'VOICEMAIL ' THEN
      RETURN 'voicemail';
    WHEN 'CALLBACK', 'CALL BACK', 'CALLBACK ' THEN
      RETURN 'callback';
    WHEN 'BLACKLISTED', 'BLACKLISTED ' THEN
      RETURN 'blacklisted';
    WHEN 'UNREACHABLE', 'UNREACHABLE ' THEN
      RETURN 'unreachable';
    WHEN 'TRAVELLING', 'TRAVELING', 'TRAVELLING ' THEN
      RETURN 'travelling';
    WHEN 'POSTPONED', 'POSTPONED ' THEN
      RETURN 'postponed';
    WHEN 'UNAVAILABLE', 'UNAVAILABLE ' THEN
      RETURN 'unavailable';
    WHEN 'DUPLICATE', 'DUPLICATE ' THEN
      RETURN 'duplicate';
    WHEN 'SCHEDULED', 'SCHEDULED ' THEN
      RETURN 'scheduled';
    
    -- Shipping statuses
    WHEN 'PICKED UP', 'PICKED_UP', 'RÉCUPÉRÉ', 'RECUPERE' THEN
      RETURN 'picked_up';
    WHEN 'IN TRANSIT', 'IN_TRANSIT', 'EN TRANSIT' THEN
      RETURN 'in_transit';
    WHEN 'OUT FOR DELIVERY', 'OUT_FOR_DELIVERY', 'EN LIVRAISON' THEN
      RETURN 'out_for_delivery';
    WHEN 'DESTINATION CHANGED', 'DESTINATION_CHANGED', 'DESTINATION CHANGÉE' THEN
      RETURN 'destination_changed';
    WHEN 'DELIVERED & INVOICED', 'DELIVERED_INVOICED', 'LIVRÉ ET FACTURÉ' THEN
      RETURN 'delivered_invoiced';
    WHEN 'OUT OF ZONE', 'OUT_OF_ZONE', 'HORS ZONE' THEN
      RETURN 'out_of_zone';
    WHEN 'AWAITING PICKUP', 'AWAITING_PICKUP', 'EN ATTENTE DE RÉCUPÉRATION' THEN
      RETURN 'awaiting_pickup';
    WHEN 'AWAITING ENTRY', 'AWAITING_ENTRY', 'EN ATTENTE DE SAISIE' THEN
      RETURN 'awaiting_entry';
    WHEN 'ENTERED', 'SAISI' THEN
      RETURN 'entered';
    WHEN 'DATA ENTRY', 'DATA_ENTRY', 'SAISIE' THEN
      RETURN 'data_entry';
    
    -- Default to pending for unknown statuses
    ELSE
      RETURN 'pending';
  END CASE;
END;
$$;

-- Normalize orders table
UPDATE orders
SET status = normalize_status_to_canonical(status)
WHERE status IS NOT NULL;

-- Normalize shipments table if it exists
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
  END IF;
END $$;

-- Create an index on canonical status for better performance
CREATE INDEX IF NOT EXISTS idx_orders_status_canonical ON orders(status);

-- Add constraint to ensure only canonical status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND constraint_name = 'check_orders_status_canonical'
  ) THEN
    ALTER TABLE orders
    ADD CONSTRAINT check_orders_status_canonical
    CHECK (status IN (
      'pending', 'confirmed', 'no_answer', 'unreachable', 'voicemail', 
      'callback', 'scheduled', 'postponed', 'travelling', 'cancelled', 
      'blacklisted', 'duplicate', 'unavailable', 'shipped', 'delivered', 
      'returned', 'refused', 'data_entry', 'paid', 'picked_up', 
      'awaiting_pickup', 'awaiting_entry', 'entered', 'in_transit', 
      'out_for_delivery', 'destination_changed', 'delivered_invoiced', 'out_of_zone'
    ));
  END IF;
END $$;

-- Drop the temporary function
DROP FUNCTION IF EXISTS normalize_status_to_canonical;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Status normalization completed successfully.';
  RAISE NOTICE 'All status values have been converted to canonical keys.';
  RAISE NOTICE 'status_language column added to workspaces table.';
  RAISE NOTICE 'Canonical status constraint added to orders table.';
END $$;
