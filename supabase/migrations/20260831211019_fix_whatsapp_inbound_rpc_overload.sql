-- Keep one unambiguous inbound RPC for the WhatsApp worker.
-- The legacy nine-argument address-flow overload has defaults, so PostgREST
-- cannot choose it over the confirmation-only eight-argument function.
drop function if exists public.process_whatsapp_inbound(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb,
  text
);

revoke all on function public.process_whatsapp_inbound(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated;

grant execute on function public.process_whatsapp_inbound(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb
) to service_role;

notify pgrst, 'reload schema';
