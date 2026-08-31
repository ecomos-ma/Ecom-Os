-- Ensure the production schema matches the canonical connect lifecycle.
alter table public.whatsapp_settings
  add column if not exists connection_started_at timestamptz;

-- Keep worker health and WhatsApp lifecycle separate but synchronized.
alter table public.whatsapp_settings
  add column if not exists worker_last_seen_at timestamptz;

alter table public.whatsapp_settings
  add column if not exists worker_version text;
