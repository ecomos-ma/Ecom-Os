DROP POLICY IF EXISTS ecom_error_events_read ON public.ecom_error_events;
CREATE POLICY ecom_error_events_read ON public.ecom_error_events FOR SELECT TO authenticated
  USING (public.is_supervisor() OR workspace_id IS NULL OR public.whatsapp_is_workspace_member(workspace_id));
DROP POLICY IF EXISTS ecom_error_events_insert ON public.ecom_error_events;
CREATE POLICY ecom_error_events_insert ON public.ecom_error_events FOR INSERT TO authenticated
  WITH CHECK (workspace_id IS NULL OR public.whatsapp_is_workspace_member(workspace_id));
DROP POLICY IF EXISTS ecom_error_events_update ON public.ecom_error_events;
CREATE POLICY ecom_error_events_update ON public.ecom_error_events FOR UPDATE TO authenticated
  USING (public.is_supervisor()) WITH CHECK (public.is_supervisor());
GRANT UPDATE ON public.ecom_error_events TO authenticated;
