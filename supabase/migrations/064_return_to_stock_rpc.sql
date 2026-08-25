-- ═══════════════════════════════════════════════════════════════
-- 064_return_to_stock_rpc.sql
-- Adds an RPC to safely increment returned_stock for a product.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_returned_stock(p_id UUID, qty INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE public.products
  SET returned_stock = COALESCE(returned_stock, 0) + qty
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
