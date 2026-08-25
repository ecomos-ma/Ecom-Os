-- 1. Deduplicate existing rows based on ameex_city_id
-- We only keep the row with the lowest workspace_id for each ameex_city_id
DELETE FROM public.ameex_city_mappings a
USING public.ameex_city_mappings b
WHERE a.ameex_city_id = b.ameex_city_id AND a.workspace_id > b.workspace_id;

-- 2. Drop the old primary key constraint
ALTER TABLE public.ameex_city_mappings DROP CONSTRAINT ameex_city_mappings_pkey;

-- 3. Drop the workspace_id column
ALTER TABLE public.ameex_city_mappings DROP COLUMN workspace_id CASCADE;

-- 4. Add the new columns for fees and availability
ALTER TABLE public.ameex_city_mappings 
  ADD COLUMN base_fee numeric,
  ADD COLUMN extra_fee_med numeric,
  ADD COLUMN extra_fee_hvy numeric,
  ADD COLUMN extra_fee_blk numeric,
  ADD COLUMN extra_fee_ovs numeric,
  ADD COLUMN available_monday boolean,
  ADD COLUMN available_tuesday boolean,
  ADD COLUMN available_wednesday boolean,
  ADD COLUMN available_thursday boolean,
  ADD COLUMN available_friday boolean,
  ADD COLUMN available_saturday boolean,
  ADD COLUMN available_sunday boolean,
  ADD COLUMN notes text;

-- 5. Add the new primary key on ameex_city_id
ALTER TABLE public.ameex_city_mappings ADD PRIMARY KEY (ameex_city_id);

-- 6. Update RLS policies for a global reference table
DROP POLICY IF EXISTS "ameex_city_mappings_workspace_read" ON public.ameex_city_mappings;
DROP POLICY IF EXISTS "ameex_city_mappings_workspace_insert" ON public.ameex_city_mappings;
DROP POLICY IF EXISTS "ameex_city_mappings_workspace_update" ON public.ameex_city_mappings;
DROP POLICY IF EXISTS "ameex_city_mappings_workspace_delete" ON public.ameex_city_mappings;

-- Only read access is granted to authenticated/anon users. Writing is for service_role or DB admins.
CREATE POLICY "ameex_city_mappings_read_all" ON public.ameex_city_mappings
  FOR SELECT USING (true);

-- 7. Drop the old seed trigger and functions that were per-workspace
DROP TRIGGER IF EXISTS trigger_auto_seed_ameex_cities ON public.workspaces;
DROP FUNCTION IF EXISTS public.auto_seed_ameex_cities() CASCADE;
DROP FUNCTION IF EXISTS public.seed_default_ameex_cities(uuid) CASCADE;
