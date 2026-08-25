// ============================================================
// Debug spécifique pour l'utilisateur amineelaaouamecom...@gmail.com
// Workspace "Nura" (id: 03826be0-e050-42d7-a030-a7d5a8d4f920)
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugSpecificUser() {
  console.log('=== Debug spécifique utilisateur amineelaaouamecom...@gmail.com ===\n');

  // 1. Trouver le profil de l'utilisateur
  console.log('1. Recherche du profil utilisateur...');
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, full_name, workspace_id, role, is_active')
    .ilike('email', '%amine%');
  
  // Si pas trouvé, essayer une recherche plus large
  if (!profiles || profiles.length === 0) {
    console.log('   Pas trouvé avec "%amine%", recherche de tous les profils...');
    const { data: allProfiles, error: allError } = await supabase
      .from('profiles')
      .select('id, email, full_name, workspace_id, role, is_active')
      .limit(10);
    
    if (allError) {
      console.error('   ERREUR:', allError.message);
    } else {
      console.log(`   ${allProfiles.length} premiers profils:`);
      allProfiles.forEach(p => {
        console.log(`   - ${p.full_name || p.email || p.id}: ${p.email}, workspace_id: ${p.workspace_id}`);
      });
    }
    return;
  }
  
  if (profilesError) {
    console.error('   ERREUR:', profilesError.message);
    return;
  }
  
  if (!profiles || profiles.length === 0) {
    console.log('   Aucun profil trouvé pour cet email');
    return;
  }
  
  console.log(`   ${profiles.length} profil(s) trouvé(s):`);
  profiles.forEach(p => {
    console.log(`   - ID: ${p.id}`);
    console.log(`     Email: ${p.email}`);
    console.log(`     Nom: ${p.full_name}`);
    console.log(`     workspace_id: ${p.workspace_id || 'NULL'}`);
    console.log(`     role: ${p.role}`);
    console.log(`     is_active: ${p.is_active}`);
  });
  
  const userProfile = profiles[0];
  const targetWorkspaceId = '03826be0-e050-42d7-a030-a7d5a8d4f920';
  
  console.log(`\n   Vérification: workspace_id pointe vers ${targetWorkspaceId} ?`);
  console.log(`   ${userProfile.workspace_id === targetWorkspaceId ? '✅ OUI' : '❌ NON'}`);
  console.log(`   workspace_id actuel: ${userProfile.workspace_id}`);
  
  // 2. Vérifier si le workspace existe
  console.log('\n2. Vérification du workspace "Nura"...');
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', targetWorkspaceId)
    .single();
  
  if (workspaceError) {
    console.error('   ERREUR lors de la lecture du workspace:', workspaceError.message);
    console.error('   Code:', workspaceError.code);
    console.error('   Détails:', workspaceError.details);
    console.error('   Hint:', workspaceError.hint);
  } else {
    console.log('   ✅ Workspace trouvé:');
    console.log(`   - ID: ${workspace.id}`);
    console.log(`   - Nom: ${workspace.name}`);
    console.log(`   - is_active: ${workspace.is_active}`);
    console.log(`   - status: ${workspace.status}`);
    console.log(`   - created_by: ${workspace.created_by}`);
  }
  
  // 3. Vérifier profile_workspaces
  console.log('\n3. Vérification profile_workspaces...');
  const { data: profileWorkspaces, error: pwError } = await supabase
    .from('profile_workspaces')
    .select('*')
    .eq('profile_id', userProfile.id);
  
  if (pwError) {
    console.error('   ERREUR:', pwError.message);
  } else {
    console.log(`   ${profileWorkspaces.length} entrée(s) profile_workspaces trouvée(s):`);
    profileWorkspaces.forEach(pw => {
      console.log(`   - workspace_id: ${pw.workspace_id}`);
      console.log(`     is_owner: ${pw.is_owner}`);
      console.log(`     Correspond au workspace Nura: ${pw.workspace_id === targetWorkspaceId ? '✅ OUI' : '❌ NON'}`);
    });
  }
  
  // 4. Vérifier workspace_limits
  console.log('\n4. Vérification workspace_limits...');
  const { data: limits, error: limitsError } = await supabase
    .from('workspace_limits')
    .select('*')
    .eq('profile_id', userProfile.id);
  
  if (limitsError) {
    console.error('   ERREUR:', limitsError.message);
  } else {
    console.log(`   ${limits.length} entrée(s) workspace_limits trouvée(s):`);
    limits.forEach(limit => {
      console.log(`   - plan: ${limit.plan}`);
      console.log(`     max_workspaces: ${limit.max_workspaces}`);
    });
  }
  
  // 5. Tester les fonctions RLS
  console.log('\n5. Test des fonctions RLS...');
  
  // Note: Ces tests nécessitent une session authentifiée
  console.log('   (Ces tests nécessitent une session authentifiée - à exécuter via SQL direct)');
  
  console.log('\n=== DIAGNOSTIC ===');
  
  const issues = [];
  
  if (!userProfile.workspace_id) {
    issues.push('❌ Le profil n\'a pas de workspace_id');
  } else if (userProfile.workspace_id !== targetWorkspaceId) {
    issues.push(`❌ Le workspace_id (${userProfile.workspace_id}) ne correspond pas au workspace Nura (${targetWorkspaceId})`);
  } else {
    issues.push('✅ Le workspace_id correspond au workspace Nura');
  }
  
  if (workspaceError) {
    issues.push('❌ Erreur RLS lors de la lecture du workspace - l\'utilisateur n\'a probablement pas les permissions');
  } else {
    issues.push('✅ Le workspace est accessible en lecture');
  }
  
  if (!profileWorkspaces || profileWorkspaces.length === 0) {
    issues.push('❌ Aucune entrée profile_workspaces - l\'utilisateur n\'a pas de membership');
  } else {
    const hasMembership = profileWorkspaces.some(pw => pw.workspace_id === targetWorkspaceId);
    if (hasMembership) {
      issues.push('✅ L\'utilisateur a un membership profile_workspaces pour ce workspace');
    } else {
      issues.push('❌ L\'utilisateur a des memberships mais pas pour ce workspace');
    }
  }
  
  if (!limits || limits.length === 0) {
    issues.push('❌ Aucune entrée workspace_limits');
  } else {
    issues.push('✅ workspace_limits existe');
  }
  
  console.log('\nRésultats:');
  issues.forEach(issue => console.log(`  ${issue}`));
  
  console.log('\n=== RECOMMANDATIONS ===');
  if (workspaceError) {
    console.log('1. Vérifier les policies RLS sur la table workspaces');
    console.log('2. Vérifier que l\'utilisateur a le rôle nécessaire pour accéder au workspace');
    console.log('3. Vérifier la fonction is_supervisor() et get_my_workspace_id()');
  }
  
  if (!profileWorkspaces || profileWorkspaces.length === 0) {
    console.log('4. Créer une entrée profile_workspaces pour cet utilisateur');
  }
  
  if (userProfile.workspace_id !== targetWorkspaceId) {
    console.log('5. Mettre à jour le workspace_id du profil pour pointer vers le bon workspace');
  }
}

debugSpecificUser().catch(console.error);
