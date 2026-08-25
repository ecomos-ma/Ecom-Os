-- AI Chatbot Rate Limiting Table
-- Tracks AI chatbot requests per user to prevent abuse and control costs

create table if not exists public.ai_chatbot_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Index for efficient rate limit queries
create index if not exists ai_chatbot_rate_limits_user_id_created_at_idx 
  on public.ai_chatbot_rate_limits(user_id, created_at desc);

-- RLS: Users can only see their own rate limit entries
alter table public.ai_chatbot_rate_limits enable row level security;

create policy "Users can read own rate limits"
  on public.ai_chatbot_rate_limits for select
  using (auth.uid() = user_id);

-- Service role can insert (for the Edge Function)
create policy "Service role can insert rate limits"
  on public.ai_chatbot_rate_limits for insert
  with check (true);

-- Optional: Clean up old entries (older than 24 hours) to prevent table bloat
-- This can be run as a scheduled job or manually
-- delete from public.ai_chatbot_rate_limits where created_at < now() - interval '24 hours';
