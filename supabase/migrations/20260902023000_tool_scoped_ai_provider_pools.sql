-- Extend the existing encrypted provider pool with an explicit tool scope.
-- Existing rows are kept usable under their legacy service scope; new rows
-- must declare the Ecom OS tool that is allowed to consume them.
alter table public.tool_api_providers
  add column if not exists tool_scope text not null default 'legacy',
  add column if not exists model text not null default 'default';

alter table public.tool_api_providers
  drop constraint if exists tool_api_providers_tool_scope_check;
alter table public.tool_api_providers
  add constraint tool_api_providers_tool_scope_check
  check (tool_scope ~ '^[a-z0-9][a-z0-9_-]{1,63}$');
alter table public.tool_api_providers
  drop constraint if exists tool_api_providers_model_check;
alter table public.tool_api_providers
  add constraint tool_api_providers_model_check
  check (model ~ '^[a-zA-Z0-9._:-]{1,120}$');

create index if not exists tool_api_providers_scoped_rotation_idx
  on public.tool_api_providers(tool_scope, provider, model, enabled, priority, last_used_at);

-- Keep existing services working while giving each tool an isolated pool.
update public.tool_api_providers
set tool_scope = case provider
  when 'gemini' then 'whatsapp_ai'
  when 'removebg' then 'background_removal'
  when 'tiktok' then 'tiktok_resolver'
  else tool_scope
end
where tool_scope = 'legacy';

-- Gemini also powers the existing landing-page generator. Copy only the
-- encrypted credential metadata into its own scoped row; the secret remains
-- server-held and the two tools can be managed independently afterwards.
insert into public.tool_api_providers(
  provider, name, endpoint, credential_ciphertext, credential_iv, priority,
  enabled, failure_count, last_used_at, last_success_at, last_failure_at,
  created_by, tool_scope, model
)
select p.provider, p.name || ' · Landing Page AI', p.endpoint,
  p.credential_ciphertext, p.credential_iv, p.priority, p.enabled,
  0, null, null, null, p.created_by, 'landing_page_ai', p.model
from public.tool_api_providers p
where p.provider = 'gemini' and p.tool_scope = 'whatsapp_ai'
  and not exists (
    select 1 from public.tool_api_providers existing
    where existing.provider = 'gemini' and existing.tool_scope = 'landing_page_ai'
      and existing.credential_ciphertext = p.credential_ciphertext
  );
