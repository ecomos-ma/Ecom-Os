// ============================================================
// EcomOS Workspace Issue Root Cause Analysis
// ============================================================

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeDatabase() {
  console.log('=== EcomOS Workspace Issue Root Cause Analysis ===\n');

  // 1. Check auth.users count
  console.log('1. Checking auth.users...');
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('   Error fetching auth.users:', authError.message);
  } else {
    console.log(`   Total auth.users: ${authUsers.users.length}`);
  }

  // 2. Check profiles count and structure
  console.log('\n2. Checking profiles...');
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, workspace_id, is_active, created_at');
  
  if (profilesError) {
    console.error('   Error fetching profiles:', profilesError.message);
  } else {
    console.log(`   Total profiles: ${profiles.length}`);
    console.log(`   Profiles with workspace_id: ${profiles.filter(p => p.workspace_id).length}`);
    console.log(`   Profiles without workspace_id: ${profiles.filter(p => !p.workspace_id).length}`);
    console.log(`   Profiles with is_active=true: ${profiles.filter(p => p.is_active !== false).length}`);
    console.log(`   Supervisor roles: ${profiles.filter(p => p.role === 'supervisor').length}`);
    
    if (profiles.length > 0) {
      console.log('\n   Sample profiles:');
      profiles.slice(0, 5).forEach(p => {
        console.log(`   - ${p.full_name || p.email || p.id}: role=${p.role}, workspace_id=${p.workspace_id || 'NULL'}, is_active=${p.is_active}`);
      });
    }
  }

  // 3. Check workspaces count and structure
  console.log('\n3. Checking workspaces...');
  const { data: workspaces, error: workspacesError } = await supabase
    .from('workspaces')
    .select('id, name, created_at, is_active, status, created_by');
  
  if (workspacesError) {
    console.error('   Error fetching workspaces:', workspacesError.message);
    console.error('   This suggests RLS is blocking access - KEY ISSUE');
  } else {
    console.log(`   Total workspaces: ${workspaces.length}`);
    console.log(`   Active workspaces: ${workspaces.filter(w => w.is_active !== false).length}`);
    console.log(`   Suspended workspaces: ${workspaces.filter(w => w.is_active === false).length}`);
    
    if (workspaces.length > 0) {
      console.log('\n   Sample workspaces:');
      workspaces.slice(0, 5).forEach(w => {
        console.log(`   - ${w.name}: id=${w.id}, is_active=${w.is_active}, status=${w.status}, created_by=${w.created_by || 'NULL'}`);
      });
    }
  }

  // 4. Check profile_workspaces
  console.log('\n4. Checking profile_workspaces...');
  const { data: profileWorkspaces, error: pwError } = await supabase
    .from('profile_workspaces')
    .select('profile_id, workspace_id, is_owner, created_at');
  
  if (pwError) {
    console.error('   Error fetching profile_workspaces:', pwError.message);
  } else {
    console.log(`   Total profile_workspaces entries: ${profileWorkspaces.length}`);
    console.log(`   Unique profiles with memberships: ${new Set(profileWorkspaces.map(pw => pw.profile_id)).size}`);
    console.log(`   Unique workspaces with members: ${new Set(profileWorkspaces.map(pw => pw.workspace_id)).size}`);
    console.log(`   Owner entries: ${profileWorkspaces.filter(pw => pw.is_owner).length}`);
  }

  // 5. Check workspace_limits
  console.log('\n5. Checking workspace_limits...');
  const { data: workspaceLimits, error: limitsError } = await supabase
    .from('workspace_limits')
    .select('profile_id, plan, max_workspaces');
  
  if (limitsError) {
    console.error('   Error fetching workspace_limits:', limitsError.message);
  } else {
    console.log(`   Total workspace_limits entries: ${workspaceLimits.length}`);
    console.log(`   Free plans: ${workspaceLimits.filter(wl => wl.plan === 'free').length}`);
    console.log(`   Pro plans: ${workspaceLimits.filter(wl => wl.plan === 'pro').length}`);
  }

  // 6. Check workspace_subscriptions
  console.log('\n6. Checking workspace_subscriptions...');
  const { data: subscriptions, error: subsError } = await supabase
    .from('workspace_subscriptions')
    .select('workspace_id, plan_id, status');
  
  if (subsError) {
    console.error('   Error fetching workspace_subscriptions:', subsError.message);
  } else {
    console.log(`   Total workspace_subscriptions entries: ${subscriptions.length}`);
    console.log(`   Active subscriptions: ${subscriptions.filter(s => s.status === 'active').length}`);
  }

  // 7. Check for orphaned records
  console.log('\n7. Checking for orphaned records...');
  
  // Profiles without workspace_id but with profile_workspaces
  const profilesWithoutWorkspace = profiles?.filter(p => !p.workspace_id) || [];
  const profileIdsWithMemberships = new Set(profileWorkspaces?.map(pw => pw.profile_id) || []);
  const orphanedProfiles = profilesWithoutWorkspace.filter(p => profileIdsWithMemberships.has(p.id));
  console.log(`   Profiles without workspace_id but with profile_workspaces: ${orphanedProfiles.length}`);
  
  // profile_workspaces pointing to non-existent workspaces
  const workspaceIds = new Set(workspaces?.map(w => w.id) || []);
  const orphanedMemberships = profileWorkspaces?.filter(pw => !workspaceIds.has(pw.workspace_id)) || [];
  console.log(`   profile_workspaces pointing to non-existent workspaces: ${orphanedMemberships.length}`);
  
  // profile_workspaces pointing to non-existent profiles
  const profileIds = new Set(profiles?.map(p => p.id) || []);
  const invalidMemberships = profileWorkspaces?.filter(pw => !profileIds.has(pw.profile_id)) || [];
  console.log(`   profile_workspaces pointing to non-existent profiles: ${invalidMemberships.length}`);

  // 8. Test is_supervisor() function
  console.log('\n8. Testing is_supervisor() function...');
  const { data: supervisorTest, error: supervisorError } = await supabase
    .rpc('is_supervisor');
  
  if (supervisorError) {
    console.error('   Error calling is_supervisor():', supervisorError.message);
  } else {
    console.log(`   Current user is_supervisor: ${supervisorTest}`);
  }

  // 9. Test get_my_workspace_id() function
  console.log('\n9. Testing get_my_workspace_id() function...');
  const { data: workspaceIdTest, error: workspaceIdError } = await supabase
    .rpc('get_my_workspace_id');
  
  if (workspaceIdError) {
    console.error('   Error calling get_my_workspace_id():', workspaceIdError.message);
  } else {
    console.log(`   Current user's workspace_id: ${workspaceIdTest}`);
  }

  // 10. Summary of issues found
  console.log('\n=== SUMMARY OF ISSUES ===');
  const issues = [];
  
  if (workspacesError) {
    issues.push('CRITICAL: Cannot fetch workspaces - RLS blocking admin access');
  }
  
  if (profiles?.filter(p => !p.workspace_id).length > 0) {
    issues.push(`${profiles.filter(p => !p.workspace_id).length} profiles without workspace_id`);
  }
  
  if (orphanedMemberships.length > 0) {
    issues.push(`${orphanedMemberships.length} orphaned profile_workspaces entries`);
  }
  
  if (invalidMemberships.length > 0) {
    issues.push(`${invalidMemberships.length} invalid profile_workspaces entries`);
  }
  
  if (profileWorkspaces && profileWorkspaces.length === 0 && profiles && profiles.length > 0) {
    issues.push('CRITICAL: No profile_workspaces entries exist');
  }
  
  if (workspaceLimits && workspaceLimits.length < profiles.length) {
    issues.push(`${profiles.length - workspaceLimits.length} profiles missing workspace_limits`);
  }
  
  if (subscriptions && subscriptions.length < workspaces.length) {
    issues.push(`${workspaces.length - subscriptions.length} workspaces missing subscriptions`);
  }
  
  if (issues.length === 0) {
    console.log('No critical issues detected in database structure.');
  } else {
    console.log('Issues found:');
    issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
  }

  console.log('\n=== RECOMMENDATIONS ===');
  if (workspacesError) {
    console.log('1. Fix RLS policies to allow supervisors to access all workspaces');
    console.log('2. Verify supervisor role is set correctly for admin users');
    console.log('3. Check is_supervisor() function is working correctly');
  }
  
  if (profiles?.filter(p => !p.workspace_id).length > 0) {
    console.log('4. Create workspaces for profiles without workspace_id');
    console.log('5. Add corresponding profile_workspaces entries');
  }
  
  if (profileWorkspaces && profileWorkspaces.length === 0) {
    console.log('6. Run migration to create profile_workspaces for existing profiles');
  }
  
  console.log('\nAnalysis complete.');
}

analyzeDatabase().catch(console.error);
