-- ============================================================
-- BLOCK WRITES DURING FOUNDER IMPERSONATION
-- ============================================================
-- This function blocks all write operations (INSERT, UPDATE, DELETE)
-- on critical tables when a founder is in impersonation mode.
-- It checks the founder_impersonation_audit table for active sessions.

-- Function to check if write is allowed (blocks if in impersonation mode)
CREATE OR REPLACE FUNCTION public.block_impersonation_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_founder_email text;
  v_active_session_count integer;
BEGIN
  -- Get founder email from JWT
  v_founder_email := auth.jwt()->>'email';
  
  -- Only check for founder users
  IF NOT public.is_founder_internal_user() THEN
    RETURN NEW;
  END IF;
  
  -- Check if there's an active impersonation session for this founder
  -- Active session = has session_start but no session_end
  SELECT COUNT(*) INTO v_active_session_count
  FROM public.founder_impersonation_audit
  WHERE founder_email = v_founder_email
    AND session_end IS NULL;
  
  -- If there's an active impersonation session, block the write
  IF v_active_session_count > 0 THEN
    RAISE EXCEPTION 'Write operations are not allowed during impersonation mode. Founder is viewing workspace in read-only mode.' 
    USING ERRCODE = '42501';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers on all critical tables
-- Orders
DROP TRIGGER IF EXISTS block_orders_writes ON public.orders;
CREATE TRIGGER block_orders_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.block_impersonation_writes();

-- Products
DROP TRIGGER IF EXISTS block_products_writes ON public.products;
CREATE TRIGGER block_products_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.block_impersonation_writes();

-- Expenses
DROP TRIGGER IF EXISTS block_expenses_writes ON public.expenses;
CREATE TRIGGER block_expenses_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.block_impersonation_writes();

-- Transactions (finance)
DROP TRIGGER IF EXISTS block_transactions_writes ON public.transactions;
CREATE TRIGGER block_transactions_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.block_impersonation_writes();

-- Workspace invitations
DROP TRIGGER IF EXISTS block_workspace_invitations_writes ON public.workspace_invitations;
CREATE TRIGGER block_workspace_invitations_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.block_impersonation_writes();

-- Order assignments
DROP TRIGGER IF EXISTS block_order_assignments_writes ON public.order_assignments;
CREATE TRIGGER block_order_assignments_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_assignments
  FOR EACH ROW EXECUTE FUNCTION public.block_impersonation_writes();

-- Stock history
DROP TRIGGER IF EXISTS block_stock_history_writes ON public.stock_history;
CREATE TRIGGER block_stock_history_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_history
  FOR EACH ROW EXECUTE FUNCTION public.block_impersonation_writes();

-- Delivery notes
DROP TRIGGER IF EXISTS block_delivery_notes_writes ON public.delivery_notes;
CREATE TRIGGER block_delivery_notes_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.block_impersonation_writes();

-- Support tickets
DROP TRIGGER IF EXISTS block_support_tickets_writes ON public.support_tickets;
CREATE TRIGGER block_support_tickets_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.block_impersonation_writes();

-- Workspace cost rules
DROP TRIGGER IF EXISTS block_workspace_cost_rules_writes ON public.workspace_cost_rules;
CREATE TRIGGER block_workspace_cost_rules_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_cost_rules
  FOR EACH ROW EXECUTE FUNCTION public.block_impersonation_writes();

-- Add comments
COMMENT ON FUNCTION public.block_impersonation_writes IS 'Blocks write operations for founders during impersonation mode. Checks for active impersonation sessions and raises exception if found.';
