-- 100_ai_audit_logs.sql
-- Audit log for AI infrastructure changes

CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  details     JSONB DEFAULT '{}'::jsonb,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_audit_logs_admin ON public.ai_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_ai_audit_logs_target ON public.ai_audit_logs(target_type, target_id);

ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_ai_audit_logs"
  ON public.ai_audit_logs FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
