-- ============================================================
-- SUPER ADMIN PANEL - COMPLETE DATABASE SCHEMA (ROBUST VERSION)
-- ============================================================

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS platform_settings CASCADE;
DROP TABLE IF EXISTS workspace_exports CASCADE;
DROP TABLE IF EXISTS database_backups CASCADE;
DROP TABLE IF EXISTS blocked_ips CASCADE;
DROP TABLE IF EXISTS security_logs CASCADE;
DROP TABLE IF EXISTS error_logs CASCADE;
DROP TABLE IF EXISTS system_health_logs CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;

-- ─────────────────────────────────────────────
-- ACTIVITY LOG TABLE
-- ─────────────────────────────────────────────
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  user_id UUID,
  workspace_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activity_logs_user_id_idx ON activity_logs(user_id);
CREATE INDEX activity_logs_workspace_id_idx ON activity_logs(workspace_id);
CREATE INDEX activity_logs_created_at_idx ON activity_logs(created_at DESC);
CREATE INDEX activity_logs_action_idx ON activity_logs(action);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all activity logs"
  ON activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─────────────────────────────────────────────
-- ANNOUNCEMENTS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'critical', 'security', 'maintenance', 'promotion', 'update')),
  color TEXT,
  priority INTEGER DEFAULT 0,
  icon TEXT,
  button_text TEXT,
  button_url TEXT,
  workspace_filter TEXT[],
  role_filter TEXT[],
  language TEXT DEFAULT 'en',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  dismissible BOOLEAN DEFAULT true,
  sticky BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX announcements_active_idx ON announcements(active);
CREATE INDEX announcements_start_end_idx ON announcements(start_date, end_date);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can manage announcements"
  ON announcements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );
CREATE POLICY "Authenticated users can view active announcements"
  ON announcements FOR SELECT
  USING (
    auth.role() = 'authenticated' AND active = true
  );

-- ─────────────────────────────────────────────
-- SYSTEM HEALTH LOGS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE system_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'warning', 'critical', 'down')),
  response_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX system_health_logs_service_idx ON system_health_logs(service);
CREATE INDEX system_health_logs_created_at_idx ON system_health_logs(created_at DESC);

ALTER TABLE system_health_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view system health logs"
  ON system_health_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─────────────────────────────────────────────
-- ERROR LOGS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  error_code TEXT,
  severity TEXT DEFAULT 'error' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  user_id UUID,
  workspace_id UUID,
  route TEXT,
  function_name TEXT,
  status_code INTEGER,
  browser TEXT,
  device TEXT,
  os TEXT,
  ip_address TEXT,
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX error_logs_user_id_idx ON error_logs(user_id);
CREATE INDEX error_logs_workspace_id_idx ON error_logs(workspace_id);
CREATE INDEX error_logs_severity_idx ON error_logs(severity);
CREATE INDEX error_logs_resolved_idx ON error_logs(resolved);
CREATE INDEX error_logs_created_at_idx ON error_logs(created_at DESC);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can manage error logs"
  ON error_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─────────────────────────────────────────────
-- SECURITY LOGS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('blocked_ip', 'failed_login', 'suspicious_activity', 'rate_limit', '2fa_failed', 'expired_session', 'invalid_token', 'api_abuse')),
  ip_address TEXT,
  user_id UUID,
  workspace_id UUID,
  details JSONB DEFAULT '{}',
  blocked BOOLEAN DEFAULT false,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX security_logs_ip_address_idx ON security_logs(ip_address);
CREATE INDEX security_logs_user_id_idx ON security_logs(user_id);
CREATE INDEX security_logs_event_type_idx ON security_logs(event_type);
CREATE INDEX security_logs_blocked_idx ON security_logs(blocked);

ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view security logs"
  ON security_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─────────────────────────────────────────────
-- BLOCKED IPS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  blocked_by UUID,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  permanent BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX blocked_ips_ip_address_idx ON blocked_ips(ip_address);
CREATE INDEX blocked_ips_blocked_until_idx ON blocked_ips(blocked_until);

ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can manage blocked IPs"
  ON blocked_ips FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─────────────────────────────────────────────
-- API USAGE LOGS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  workspace_id UUID,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX api_usage_logs_user_id_idx ON api_usage_logs(user_id);
CREATE INDEX api_usage_logs_workspace_id_idx ON api_usage_logs(workspace_id);
CREATE INDEX api_usage_logs_created_at_idx ON api_usage_logs(created_at DESC);
CREATE INDEX api_usage_logs_endpoint_idx ON api_usage_logs(endpoint);

ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view API usage logs"
  ON api_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─────────────────────────────────────────────
-- DATABASE BACKUPS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE database_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('manual', 'daily', 'weekly', 'monthly')),
  size_bytes BIGINT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  file_path TEXT,
  duration_seconds INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX database_backups_type_idx ON database_backups(type);
CREATE INDEX database_backups_status_idx ON database_backups(status);
CREATE INDEX database_backups_created_at_idx ON database_backups(created_at DESC);

ALTER TABLE database_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can manage database backups"
  ON database_backups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─────────────────────────────────────────────
-- WORKSPACE EXPORTS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE workspace_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  export_type TEXT NOT NULL CHECK (export_type IN ('full', 'orders', 'products', 'users', 'settings')),
  format TEXT NOT NULL CHECK (format IN ('zip', 'json', 'csv', 'sql')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_path TEXT,
  file_size_bytes BIGINT,
  progress INTEGER DEFAULT 0,
  includes TEXT[] DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX workspace_exports_workspace_id_idx ON workspace_exports(workspace_id);
CREATE INDEX workspace_exports_status_idx ON workspace_exports(status);
CREATE INDEX workspace_exports_created_at_idx ON workspace_exports(created_at DESC);

ALTER TABLE workspace_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can manage workspace exports"
  ON workspace_exports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─────────────────────────────────────────────
-- PLATFORM SETTINGS TABLE
-- ─────────────────────────────────────────────
CREATE TABLE platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  category TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX platform_settings_key_idx ON platform_settings(setting_key);
CREATE INDEX platform_settings_category_idx ON platform_settings(category);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can manage platform settings"
  ON platform_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );
CREATE POLICY "Authenticated users can view platform settings"
  ON platform_settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- Insert default platform settings
-- ─────────────────────────────────────────────
INSERT INTO platform_settings (setting_key, value, description, category) VALUES
('platform_name', '"EcomOS"', 'Platform name', 'general'),
('maintenance_mode', 'false', 'Enable maintenance mode', 'general'),
('registration_enabled', 'true', 'Allow new user registration', 'general'),
('max_workspaces_per_user', '5', 'Maximum workspaces per user', 'limits'),
('max_storage_per_workspace_mb', '1024', 'Maximum storage per workspace in MB', 'limits');

-- ─────────────────────────────────────────────
-- Update profiles table to add more fields for admin
-- ─────────────────────────────────────────────
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_login_ip TEXT,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- ─────────────────────────────────────────────
-- Update workspaces table to add more fields for admin
-- ─────────────────────────────────────────────
ALTER TABLE workspaces 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0;