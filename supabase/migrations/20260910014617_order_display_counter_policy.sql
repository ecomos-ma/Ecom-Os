-- Explicitly document and enforce that browser roles cannot access the
-- internal allocator table. Edge Functions use service_role, which bypasses
-- RLS and is the only application role granted table privileges.
CREATE POLICY "No direct client access to order display counters"
ON public.order_display_counters
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
