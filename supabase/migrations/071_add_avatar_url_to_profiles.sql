-- ============================================================
-- Add avatar_url column to profiles table
-- ============================================================

-- Add avatar_url column to profiles table
alter table public.profiles 
add column if not exists avatar_url text;

-- Add comment to document the column
comment on column public.profiles.avatar_url is 'URL to the user profile picture stored in Supabase Storage';

-- Update RLS policy to allow users to update their own avatar_url
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id);