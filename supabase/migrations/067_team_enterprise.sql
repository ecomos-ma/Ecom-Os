-- 067_team_enterprise.sql
-- Enterprise Team Management: extended profiles, order assignments, activity logs, presence

-- ─── Clean up any conflicting previous attempts ────────────────────────────────
DROP TABLE IF EXISTS public.team_member_profiles CASCADE;
DROP TABLE IF EXISTS public.order_assignments CASCADE;
DROP TABLE IF EXISTS public.member_activity_log CASCADE;
DROP TABLE IF EXISTS public.agent_presence CASCADE;

-- ─── 1. Extended member profiles ─────────────────────────────────────────────
CREATE TABLE public.team_member_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone text,
  department text,
  avatar_url text,
  agent_status text DEFAULT 'offline' CHECK (agent_status IN ('online','offline','busy','break','lunch','vacation','idle')),
  shift text DEFAULT 'morning' CHECK (shift IN ('morning','evening','night','custom','off')),
  daily_limit int DEFAULT 80,
  max_active_orders int DEFAULT 30,
  assignment_weight numeric DEFAULT 1.0,
  xp int DEFAULT 0,
  rank text DEFAULT 'Bronze',
  total_points int DEFAULT 0,
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (workspace_id, profile_id)
);

ALTER TABLE public.team_member_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_profiles_workspace ON public.team_member_profiles
  FOR ALL USING (workspace_id = public.get_my_workspace_id());

CREATE INDEX idx_tmp_workspace ON public.team_member_profiles (workspace_id);
CREATE INDEX idx_tmp_profile ON public.team_member_profiles (profile_id);

-- ─── 2. Order assignments ─────────────────────────────────────────────────────
CREATE TABLE public.order_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  assigned_to uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id),
  assigned_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  result text CHECK (result IN ('confirmed','cancelled','no_answer','refused','pending')),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.order_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY oa_workspace ON public.order_assignments
  FOR ALL USING (workspace_id = public.get_my_workspace_id());

CREATE INDEX idx_oa_workspace ON public.order_assignments (workspace_id);
CREATE INDEX idx_oa_agent ON public.order_assignments (assigned_to);
CREATE INDEX idx_oa_created ON public.order_assignments (created_at DESC);

-- ─── 3. Activity log ─────────────────────────────────────────────────────────
CREATE TABLE public.member_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,        
  entity_type text,            
  entity_id text,
  entity_label text,
  old_value text,
  new_value text,
  ip_address text,
  device text,
  browser text,
  page text,
  session_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.member_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY mal_workspace ON public.member_activity_log
  FOR ALL USING (workspace_id = public.get_my_workspace_id());

CREATE INDEX idx_mal_workspace ON public.member_activity_log (workspace_id);
CREATE INDEX idx_mal_profile ON public.member_activity_log (profile_id);
CREATE INDEX idx_mal_created ON public.member_activity_log (created_at DESC);

-- ─── 4. Agent presence ───────────────────────────────────────────────────────
CREATE TABLE public.agent_presence (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text DEFAULT 'offline' CHECK (status IN ('online','offline','busy','break','lunch','vacation','idle')),
  last_heartbeat timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY ap_workspace ON public.agent_presence
  FOR ALL USING (workspace_id = public.get_my_workspace_id());

CREATE INDEX idx_ap_workspace ON public.agent_presence (workspace_id);
