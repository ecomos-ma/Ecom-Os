-- ============================================================
-- Debug spécifique pour l'utilisateur amineelaaouamecom...@gmail.com
-- Workspace "Nura" (id: 03826be0-e050-42d7-a030-a7d5a8d4f920)
-- À exécuter dans l'éditeur SQL Supabase
-- ============================================================

-- 1. Trouver le profil de l'utilisateur
SELECT '1. Profil utilisateur' as step;
SELECT id, email, full_name, workspace_id, role, is_active, created_at
FROM profiles 
WHERE email ILIKE '%amine%' 
OR full_name ILIKE '%amine%'
LIMIT 10;

-- 2. Vérifier le workspace "Nura"
SELECT '2. Workspace Nura' as step;
SELECT id, name, created_at, is_active, status, created_by
FROM workspaces 
WHERE id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- 3. Vérifier profile_workspaces pour cet utilisateur
SELECT '3. Profile_workspaces (tous)' as step;
SELECT pw.profile_id, p.email, p.full_name, pw.workspace_id, w.name, pw.is_owner
FROM profile_workspaces pw
JOIN profiles p ON pw.profile_id = p.id
JOIN workspaces w ON pw.workspace_id = w.id
WHERE p.email ILIKE '%amine%' OR p.full_name ILIKE '%amine%';

-- 4. Vérifier profile_workspaces pour le workspace Nura
SELECT '4. Profile_workspaces pour workspace Nura' as step;
SELECT pw.profile_id, p.email, p.full_name, pw.workspace_id, w.name, pw.is_owner
FROM profile_workspaces pw
JOIN profiles p ON pw.profile_id = p.id
JOIN workspaces w ON pw.workspace_id = w.id
WHERE w.id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- 5. Vérifier workspace_limits
SELECT '5. Workspace_limits' as step;
SELECT * FROM workspace_limits
WHERE profile_id IN (
  SELECT id FROM profiles 
  WHERE email ILIKE '%amine%' OR full_name ILIKE '%amine%'
);

-- 6. Vérifier les policies RLS sur workspaces
SELECT '6. Policies RLS sur workspaces' as step;
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'workspaces';

-- 7. Vérifier les policies RLS sur profiles
SELECT '7. Policies RLS sur profiles' as step;
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'profiles';

-- 8. Vérifier les functions RLS
SELECT '8. Functions RLS' as step;
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN ('is_supervisor', 'get_my_workspace_id');

-- 9. Vérifier les profils sans workspace_id
SELECT '9. Profils sans workspace_id' as step;
SELECT id, email, full_name, role, is_active, created_at
FROM profiles 
WHERE workspace_id IS NULL
LIMIT 10;

-- 10. Vérifier les workspaces sans owner
SELECT '10. Workspaces sans owner (created_by NULL)' as step;
SELECT id, name, created_at, is_active, status
FROM workspaces 
WHERE created_by IS NULL
LIMIT 10;

-- 11. Diagnostic complet pour le workspace Nura
SELECT '11. Diagnostic complet workspace Nura' as step;
SELECT 
  w.id as workspace_id,
  w.name as workspace_name,
  w.is_active,
  w.status,
  w.created_by,
  (SELECT COUNT(*) FROM profiles WHERE workspace_id = w.id) as profiles_count,
  (SELECT COUNT(*) FROM profile_workspaces WHERE workspace_id = w.id) as memberships_count,
  (SELECT COUNT(*) FROM workspace_subscriptions WHERE workspace_id = w.id) as subscriptions_count,
  (SELECT COUNT(*) FROM workspace_limits WHERE profile_id IN (SELECT id FROM profiles WHERE workspace_id = w.id)) as limits_count
FROM workspaces w
WHERE w.id = '03826be0-e050-42d7-a030-a7d5a8d4f920';

-- 12. Vérifier si le workspace Nura a des profile_workspaces
SELECT '12. Profile_workspaces pour workspace Nura (détail)' as step;
SELECT 
  pw.id,
  pw.profile_id,
  p.email,
  p.full_name,
  p.workspace_id as profile_workspace_id,
  pw.workspace_id as membership_workspace_id,
  pw.is_owner,
  pw.created_at
FROM profile_workspaces pw
LEFT JOIN profiles p ON pw.profile_id = p.id
WHERE pw.workspace_id = '03826be0-e050-42d7-a030-a7d5a8d4f920';
