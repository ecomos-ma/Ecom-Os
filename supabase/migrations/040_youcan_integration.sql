-- ============================================================
-- EcomOS · YouCan Multi-Tenant OAuth Integration
-- ============================================================

-- Table youcan_credentials : stocke les credentials chiffrés par workspace
CREATE TABLE IF NOT EXISTS public.youcan_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_secret_encrypted TEXT NOT NULL, -- AES-256 encrypted (format: iv:encrypted)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id)
);

-- Table youcan_tokens : stocke les tokens OAuth par workspace
CREATE TABLE IF NOT EXISTS public.youcan_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id)
);

-- Ajout colonne source sur orders si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'source') THEN
    ALTER TABLE public.orders ADD COLUMN source TEXT DEFAULT 'manual';
  END IF;
END$$;

-- Indexes
CREATE INDEX IF NOT EXISTS youcan_credentials_workspace_id_idx ON public.youcan_credentials(workspace_id);
CREATE INDEX IF NOT EXISTS youcan_tokens_workspace_id_idx ON public.youcan_tokens(workspace_id);
CREATE INDEX IF NOT EXISTS orders_source_idx ON public.orders(source);

-- RLS sur youcan_credentials
ALTER TABLE public.youcan_credentials ENABLE ROW LEVEL SECURITY;

-- Policy : un workspace ne peut lire/écrire que ses propres credentials
CREATE POLICY "Workspace can manage own YouCan credentials"
  ON public.youcan_credentials
  FOR ALL
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- RLS sur youcan_tokens
ALTER TABLE public.youcan_tokens ENABLE ROW LEVEL SECURITY;

-- Policy : un workspace ne peut lire/écrire que ses propres tokens
CREATE POLICY "Workspace can manage own YouCan tokens"
  ON public.youcan_tokens
  FOR ALL
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Trigger pour updated_at automatique
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_youcan_credentials_updated_at
  BEFORE UPDATE ON public.youcan_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_youcan_tokens_updated_at
  BEFORE UPDATE ON public.youcan_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
