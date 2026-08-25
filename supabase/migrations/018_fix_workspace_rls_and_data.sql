-- ============================================================
-- EcomOS · Fix Workspace RLS and Data Integrity
-- Résout les problèmes d'accès workspace et synchronise les données
-- ============================================================

-- 1. Créer une fonction améliorée pour vérifier l'accès workspace
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(workspace_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Un utilisateur a accès si:
  -- 1. Il est supervisor
  -- 2. Son profile.workspace_id correspond
  -- 3. Il a une entrée profile_workspaces pour ce workspace
  SELECT 
    public.is_supervisor() 
    OR workspace_uuid = public.get_my_workspace_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_workspaces 
      WHERE profile_id = auth.uid() 
      AND workspace_id = workspace_uuid
    );
$$;

-- 2. Mettre à jour la policy workspaces pour utiliser la nouvelle fonction
DROP POLICY IF EXISTS "Users and supervisors can read workspaces" ON public.workspaces;
CREATE POLICY "Users and supervisors can read workspaces"
  ON public.workspaces FOR SELECT
  USING (public.user_has_workspace_access(id));

DROP POLICY IF EXISTS "Users and supervisors can update workspaces" ON public.workspaces;
CREATE POLICY "Users and supervisors can update workspaces"
  ON public.workspaces FOR UPDATE
  USING (public.user_has_workspace_access(id))
  WITH CHECK (public.user_has_workspace_access(id));

-- 3. Synchroniser profile_workspaces avec profiles.workspace_id
-- Créer les entrées profile_workspaces manquantes
INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner)
SELECT 
  p.id as profile_id,
  p.workspace_id as workspace_id,
  true as is_owner
FROM public.profiles p
WHERE p.workspace_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.profile_workspaces pw
  WHERE pw.profile_id = p.id 
  AND pw.workspace_id = p.workspace_id
)
ON CONFLICT (profile_id, workspace_id) DO NOTHING;

-- 4. Créer workspace_limits pour les profils qui n'en ont pas
INSERT INTO public.workspace_limits (profile_id, max_workspaces, plan)
SELECT 
  p.id as profile_id,
  1 as max_workspaces,
  'free' as plan
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_limits wl
  WHERE wl.profile_id = p.id
)
ON CONFLICT (profile_id) DO NOTHING;

-- 5. Créer workspace_subscriptions pour les workspaces qui n'en ont pas
-- D'abord, s'assurer qu'il y a un plan free par défaut
INSERT INTO public.subscription_plans (name, description, orders_limit, products_limit, members_limit, storage_limit_gb, integrations_limit, price_cents, currency)
VALUES ('free', 'Free Plan', 1000, 1000, 10, 10, 5, 0, 'USD')
ON CONFLICT (name) DO NOTHING;

-- Puis créer les subscriptions
INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, started_at)
SELECT 
  w.id as workspace_id,
  (SELECT id FROM public.subscription_plans WHERE name = 'free' LIMIT 1) as plan_id,
  'active' as status,
  NOW() as started_at
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_subscriptions ws
  WHERE ws.workspace_id = w.id
)
ON CONFLICT DO NOTHING;

-- 6. Réparer les profils sans workspace_id mais avec profile_workspaces
-- Leur assigner le premier workspace disponible
UPDATE public.profiles p
SET workspace_id = (
  SELECT pw.workspace_id 
  FROM public.profile_workspaces pw 
  WHERE pw.profile_id = p.id 
  LIMIT 1
)
WHERE p.workspace_id IS NULL
AND EXISTS (
  SELECT 1 FROM public.profile_workspaces pw 
  WHERE pw.profile_id = p.id
);

-- 7. Créer des workspaces pour les profils qui n'en ont pas
-- Pour les profils sans workspace_id et sans profile_workspaces
DO $$
DECLARE
  profile_record RECORD;
  new_workspace_id uuid;
BEGIN
  FOR profile_record IN 
    SELECT id, full_name FROM public.profiles 
    WHERE workspace_id IS NULL 
    AND NOT EXISTS (
      SELECT 1 FROM public.profile_workspaces pw 
      WHERE pw.profile_id = profiles.id
    )
    LIMIT 100  -- Limiter à 100 pour éviter les timeouts
  LOOP
    -- Créer un workspace
    INSERT INTO public.workspaces (name, created_by)
    VALUES (
      COALESCE(profile_record.full_name, 'User') || '''s Workspace',
      profile_record.id
    )
    RETURNING id INTO new_workspace_id;
    
    -- Mettre à jour le profil
    UPDATE public.profiles 
    SET workspace_id = new_workspace_id 
    WHERE id = profile_record.id;
    
    -- Créer profile_workspaces
    INSERT INTO public.profile_workspaces (profile_id, workspace_id, is_owner)
    VALUES (profile_record.id, new_workspace_id, true)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 8. Mettre à jour la policy profiles pour permettre la lecture
DROP POLICY IF EXISTS "Users and supervisors can read profiles" ON public.profiles;
CREATE POLICY "Users and supervisors can read profiles"
  ON public.profiles FOR SELECT
  USING (
    public.is_supervisor() 
    OR id = auth.uid() 
    OR workspace_id = public.get_my_workspace_id()
    OR workspace_id IN (
      SELECT workspace_id FROM public.profile_workspaces 
      WHERE profile_id = auth.uid()
    )
  );

-- 9. Mettre à jour la policy profile_workspaces pour être plus permissive
DROP POLICY IF EXISTS "profiles_can_read_their_profile_workspaces" ON public.profile_workspaces;
CREATE POLICY "profiles_can_read_their_profile_workspaces"
  ON public.profile_workspaces FOR SELECT
  USING (
    public.is_supervisor() 
    OR profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "profiles_can_manage_their_profile_workspaces" ON public.profile_workspaces;
CREATE POLICY "profiles_can_manage_their_profile_workspaces"
  ON public.profile_workspaces FOR ALL
  USING (
    public.is_supervisor() 
    OR profile_id = auth.uid()
  )
  WITH CHECK (
    public.is_supervisor() 
    OR profile_id = auth.uid()
  );

-- 10. Créer des fonctions RPC admin pour contourner RLS
CREATE OR REPLACE FUNCTION public.admin_get_all_workspaces()
RETURNS TABLE (
  id uuid,
  name text,
  created_at timestamptz,
  meta_access_token text,
  meta_ad_account_id text,
  is_active boolean,
  status text,
  created_by uuid
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    w.id,
    w.name,
    w.created_at,
    w.meta_access_token,
    w.meta_ad_account_id,
    w.is_active,
    w.status,
    w.created_by
  FROM public.workspaces w
  ORDER BY w.created_at DESC;
$$;

-- Créer une fonction similaire pour les profils
CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text,
  workspace_id uuid,
  created_at timestamptz,
  is_active boolean,
  deleted_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.workspace_id,
    p.created_at,
    p.is_active,
    p.deleted_at
  FROM public.profiles p
  ORDER BY p.created_at DESC;
$$;

-- Grant access to authenticated users for these admin functions
GRANT EXECUTE ON FUNCTION public.admin_get_all_workspaces() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles() TO authenticated;

-- 12. Validation finale
-- Afficher un résumé des corrections
DO $$
DECLARE
  profiles_without_ws int;
  profiles_without_membership int;
  workspaces_without_subscription int;
  profiles_without_limits int;
BEGIN
  SELECT COUNT(*) INTO profiles_without_ws 
  FROM public.profiles WHERE workspace_id IS NULL;
  
  SELECT COUNT(*) INTO profiles_without_membership
  FROM public.profiles p 
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profile_workspaces pw 
    WHERE pw.profile_id = p.id
  );
  
  SELECT COUNT(*) INTO workspaces_without_subscription
  FROM public.workspaces w 
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workspace_subscriptions ws 
    WHERE ws.workspace_id = w.id
  );
  
  SELECT COUNT(*) INTO profiles_without_limits
  FROM public.profiles p 
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workspace_limits wl 
    WHERE wl.profile_id = p.id
  );
  
  RAISE NOTICE '=== RÉPARATION WORKSPACE TERMINÉE ===';
  RAISE NOTICE 'Profils sans workspace_id: %', profiles_without_ws;
  RAISE NOTICE 'Profils sans membership: %', profiles_without_membership;
  RAISE NOTICE 'Workspaces sans subscription: %', workspaces_without_subscription;
  RAISE NOTICE 'Profils sans limits: %', profiles_without_limits;
  
  IF profiles_without_ws = 0 AND profiles_without_membership = 0 
     AND workspaces_without_subscription = 0 AND profiles_without_limits = 0 THEN
    RAISE NOTICE '✅ Toutes les incohérences ont été résolues';
  ELSE
    RAISE NOTICE '⚠️ Certaines incohérences subsistent, vérifiez les logs';
  END IF;
END $$;
