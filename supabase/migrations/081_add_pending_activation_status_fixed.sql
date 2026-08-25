-- ============================================================
-- Add pending_activation status to workspace_subscriptions (FIXED)
-- ============================================================

-- First check if the constraint exists before dropping
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'workspace_subscriptions_status_check'
  ) THEN
    ALTER TABLE public.workspace_subscriptions 
    DROP CONSTRAINT workspace_subscriptions_status_check;
  END IF;
END $$;

-- Add the updated check constraint with pending_activation
ALTER TABLE public.workspace_subscriptions 
ADD CONSTRAINT workspace_subscriptions_status_check 
CHECK (status IN ('active','trial','cancelled','expired','pending_activation'));
