-- Cloudflare Workers AI model identifiers include an @ prefix and slash.
alter table public.tool_api_providers
  drop constraint if exists tool_api_providers_model_check;
alter table public.tool_api_providers
  add constraint tool_api_providers_model_check
  check (model ~ '^[a-zA-Z0-9._:@/-]{1,120}$');
