// ============================================================
// Diagnostic Orders Workspace Nura - Exécution réelle
// Workspace ID: 03826be0-e050-42d7-a030-a7d5a8d4f920
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

const NURA_WORKSPACE_ID = '03826be0-e050-42d7-a030-a7d5a8d4f920';

async function runDiagnostic() {
  console.log('=== DIAGNOSTIC ORDERS WORKSPACE NURA ===\n');
  console.log('Workspace ID:', NURA_WORKSPACE_ID);
  console.log('');

  // 1. COUNT orders pour workspace Nura
  console.log('1. COUNT orders pour workspace Nura');
  console.log('-------------------------------------------');
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', NURA_WORKSPACE_ID);
    
    if (error) {
      console.error('❌ ERREUR:', error.message);
      console.error('   Code:', error.code);
      console.error('   Details:', error.details);
      console.error('   Hint:', error.hint);
    } else {
      console.log('✅ COUNT orders:', data?.count || 0);
      if ((data?.count || 0) === 0) {
        console.log('⚠️  Aucune order trouvée - problème de données possibles');
      } else {
        console.log('✅ Données présentes - problème probablement RLS/permissions');
      }
    }
  } catch (e) {
    console.error('❌ EXCEPTION:', e.message);
  }
  console.log('');

  // 2. Échantillon orders SANS jointures
  console.log('2. Échantillon orders (5 premiers) SANS jointures');
  console.log('-------------------------------------------');
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('❌ ERREUR:', error.message);
      console.error('   Code:', error.code);
      console.error('   Details:', error.details);
      console.error('   Hint:', error.hint);
    } else {
      console.log('✅ Résultats:', data?.length || 0, 'orders trouvées');
      if (data && data.length > 0) {
        console.log('   Premier order:');
        const firstOrder = data[0];
        console.log('   - ID:', firstOrder.id);
        console.log('   - Order Number:', firstOrder.order_number);
        console.log('   - Customer ID:', firstOrder.customer_id);
        console.log('   - City:', firstOrder.city);
        console.log('   - Status:', firstOrder.status);
        console.log('   - Total:', firstOrder.total);
        console.log('   - Created At:', firstOrder.created_at);
        console.log('   - Workspace ID:', firstOrder.workspace_id);
      } else {
        console.log('⚠️  Aucun résultat - même sans jointures');
      }
    }
  } catch (e) {
    console.error('❌ EXCEPTION:', e.message);
  }
  console.log('');

  // 3. Test avec jointure customers uniquement
  console.log('3. Test avec jointure customers uniquement');
  console.log('-------------------------------------------');
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(id, name, phone, city)')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('❌ ERREUR:', error.message);
      console.error('   Code:', error.code);
      console.error('   Details:', error.details);
      console.error('   Hint:', error.hint);
    } else {
      console.log('✅ Résultats:', data?.length || 0, 'orders trouvées');
      if (data && data.length > 0) {
        console.log('   Jointure customers fonctionnelle');
      } else {
        console.log('⚠️  Jointure customers problématique');
      }
    }
  } catch (e) {
    console.error('❌ EXCEPTION:', e.message);
  }
  console.log('');

  // 4. Test avec jointure ozon_cities uniquement
  console.log('4. Test avec jointure ozon_cities uniquement');
  console.log('-------------------------------------------');
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, ozon_cities(id, name, delivered_price, returned_price, refused_price)')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('❌ ERREUR:', error.message);
      console.error('   Code:', error.code);
      console.error('   Details:', error.details);
      console.error('   Hint:', error.hint);
    } else {
      console.log('✅ Résultats:', data?.length || 0, 'orders trouvées');
      if (data && data.length > 0) {
        console.log('   Jointure ozon_cities fonctionnelle');
      } else {
        console.log('⚠️  Jointure ozon_cities problématique');
      }
    }
  } catch (e) {
    console.error('❌ EXCEPTION:', e.message);
  }
  console.log('');

  // 5. Test avec jointure complète (comme l'API REST)
  console.log('5. Test jointure complète (orders + customers + ozon_cities)');
  console.log('-------------------------------------------');
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(id, name, phone, city), ozon_cities(id, name, delivered_price, returned_price, refused_price)')
      .eq('workspace_id', NURA_WORKSPACE_ID)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('❌ ERREUR:', error.message);
      console.error('   Code:', error.code);
      console.error('   Details:', error.details);
      console.error('   Hint:', error.hint);
    } else {
      console.log('✅ Résultats:', data?.length || 0, 'orders trouvées');
      if (data && data.length > 0) {
        console.log('   ✅ Jointure complète fonctionnelle');
      } else {
        console.log('   ❌ Jointure complète échoue - même sans données');
      }
    }
  } catch (e) {
    console.error('❌ EXCEPTION:', e.message);
  }
  console.log('');

  // 6. Vérifier customers liés
  console.log('6. Customers liés aux orders du workspace Nura');
  console.log('-------------------------------------------');
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, city, workspace_id')
      .in('id', (
        await supabase
          .from('orders')
          .select('customer_id')
          .eq('workspace_id', NURA_WORKSPACE_ID)
          .limit(10)
      ).data?.map(o => o.customer_id).filter(Boolean) || []);
    
    if (error) {
      console.error('❌ ERREUR:', error.message);
    } else {
      console.log('✅ Customers liés:', data?.length || 0);
      if (data && data.length > 0) {
        console.log('   Premier customer:', data[0].name, data[0].phone);
      }
    }
  } catch (e) {
    console.error('❌ EXCEPTION:', e.message);
  }
  console.log('');

  // 7. COUNT ozon_cities
  console.log('7. COUNT ozon_cities');
  console.log('-------------------------------------------');
  try {
    const { data, error } = await supabase
      .from('ozon_cities')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('❌ ERREUR:', error.message);
    } else {
      console.log('✅ COUNT ozon_cities:', data?.count || 0);
    }
  } catch (e) {
    console.error('❌ EXCEPTION:', e.message);
  }
  console.log('');

  // 8. Vérifier distribution des city dans orders
  console.log('8. Distribution des valeurs city dans orders du workspace Nura');
  console.log('-------------------------------------------');
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('city')
      .eq('workspace_id', NURA_WORKSPACE_ID);
    
    if (error) {
      console.error('❌ ERREUR:', error.message);
    } else {
      const cityCounts = {};
      data?.forEach(o => {
        if (o.city) {
          cityCounts[o.city] = (cityCounts[o.city] || 0) + 1;
        }
      });
      console.log('✅ Cities trouvées:', Object.keys(cityCounts).length);
      Object.entries(cityCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([city, count]) => {
          console.log(`   - ${city}: ${count} orders`);
        });
    }
  } catch (e) {
    console.error('❌ EXCEPTION:', e.message);
  }
  console.log('');

  // 9. Lister tous les workspaces existants
  console.log('9. Tous les workspaces existants');
  console.log('-------------------------------------------');
  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ ERREUR:', error.message);
      console.error('   Ceci indique un problème RLS sur workspaces aussi');
    } else {
      console.log('✅ Workspaces trouvés:', data?.length || 0);
      data?.forEach(ws => {
        const isNura = ws.id === NURA_WORKSPACE_ID;
        console.log(`   ${isNura ? '→ ' : '  '}${ws.name} (${ws.id})`);
      });
    }
  } catch (e) {
    console.error('❌ EXCEPTION:', e.message);
  }
  console.log('');

  // 10. Test accès pour un autre workspace (si disponible)
  console.log('10. Test accès pour un autre workspace (si disponible)');
  console.log('-------------------------------------------');
  try {
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id, name')
      .neq('id', NURA_WORKSPACE_ID)
      .limit(1);
    
    if (workspaces && workspaces.length > 0) {
      const otherWorkspace = workspaces[0];
      console.log('Test avec workspace:', otherWorkspace.name, otherWorkspace.id);
      
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', otherWorkspace.id);
      
      if (error) {
        console.error('❌ ERREUR sur autre workspace:', error.message);
      } else {
        console.log('✅ Orders dans autre workspace:', orders?.count || 0);
      }
    } else {
      console.log('⚠️  Pas d\'autre workspace disponible pour le test');
    }
  } catch (e) {
    console.error('❌ EXCEPTION:', e.message);
  }
  console.log('');

  console.log('=== FIN DU DIAGNOSTIC ===');
  console.log('');
  console.log('ANALYSE DES RÉSULTATS:');
  console.log('1. Si COUNT > 0 mais requête jointure échoue → Problème RLS sur tables jointes');
  console.log('2. Si COUNT = 0 → Problème de données (workspace_id incorrect)');
  console.log('3. Si workspaces query échoue → Problème RLS général sur workspaces');
  console.log('4. Si autre workspace fonctionne → Problème spécifique à Nura');
}

runDiagnostic().catch(console.error);
