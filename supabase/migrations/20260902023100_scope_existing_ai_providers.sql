update public.tool_api_providers
set tool_scope = case provider
  when 'gemini' then 'whatsapp_ai'
  when 'removebg' then 'background_removal'
  when 'tiktok' then 'tiktok_resolver'
  else tool_scope
end
where tool_scope = 'legacy';

insert into public.tool_api_providers(
  provider, name, endpoint, credential_ciphertext, credential_iv, priority,
  enabled, failure_count, created_by, tool_scope, model
)
select p.provider, p.name || ' · Landing Page AI', p.endpoint,
  p.credential_ciphertext, p.credential_iv, p.priority, p.enabled,
  0, p.created_by, 'landing_page_ai', p.model
from public.tool_api_providers p
where p.provider = 'gemini' and p.tool_scope = 'whatsapp_ai'
  and not exists (
    select 1 from public.tool_api_providers existing
    where existing.provider = 'gemini' and existing.tool_scope = 'landing_page_ai'
      and existing.credential_ciphertext = p.credential_ciphertext
  );
