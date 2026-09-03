-- The initial multi-field function used a non-existent city mapping status.
-- Replace only that exact assignment while preserving the deployed function's
-- signature, security attributes, and all validated action logic.
do $fix$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.execute_whatsapp_ai_actions(uuid,uuid,text,uuid,jsonb)'::regprocedure
  ) into v_definition;
  if position('city_mapping_status = ''unmapped''' in v_definition) = 0 then
    raise exception 'Expected WhatsApp AI city mapping assignment was not found';
  end if;
  v_definition := replace(v_definition, 'city_mapping_status = ''unmapped''', 'city_mapping_status = ''unresolved''');
  execute v_definition;
end;
$fix$;

revoke all on function public.execute_whatsapp_ai_actions(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.execute_whatsapp_ai_actions(uuid, uuid, text, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
