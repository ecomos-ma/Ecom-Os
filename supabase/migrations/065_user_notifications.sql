-- ============================================================
-- EcomOS · User Notifications System
-- Create table for user-specific notifications with read/unread state
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'system' CHECK (type IN ('order', 'shipping', 'inventory', 'customer', 'system')),
  title text NOT NULL,
  message text NOT NULL,
  entity_id uuid,
  entity_type text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_workspace ON public.user_notifications(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_read ON public.user_notifications(read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON public.user_notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own notifications in their workspace
CREATE POLICY "Users can read own notifications"
  ON public.user_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
  ON public.user_notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.user_notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.user_notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER trg_user_notifications_updated_at
  BEFORE UPDATE ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Function to create notification (callable from edge functions or triggers)
CREATE OR REPLACE FUNCTION public.create_user_notification(
  p_user_id uuid,
  p_workspace_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL
)
RETURNS uuid AS $$
BEGIN
  INSERT INTO public.user_notifications (
    user_id,
    workspace_id,
    type,
    title,
    message,
    entity_id,
    entity_type
  ) VALUES (
    p_user_id,
    p_workspace_id,
    p_type,
    p_title,
    p_message,
    p_entity_id,
    p_entity_type
  )
  RETURNING id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on function to authenticated users
GRANT EXECUTE ON FUNCTION public.create_user_notification TO authenticated;