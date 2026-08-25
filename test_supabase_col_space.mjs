import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('❌ VITE_SUPABASE_URL non trouvé');
  console.log('Variables disponibles:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey || '');

async function testColumnWithSpace() {
  const orderId = '7ee2ae4e-a97b-4bec-b59c-cc1d8008a8fa';
  console.log('=== TEST SYNTAXE SUPABASE JS COLONNE AVEC ESPACE ===\n');
  console.log(`Order ID: ${orderId}\n`);

  // Test 1: Syntaxe directe avec espace
  console.log('Test 1: .eq("Order ID", orderId)');
  try {
    const { data: order1, error: error1 } = await supabase
      .from('orders')
      .select('*')
      .eq('Order ID', orderId)
      .single();
    
    if (error1) {
      console.log(`   ❌ Erreur: ${error1.message}`);
      console.log(`   Code: ${error1.code}`);
      console.log(`   Details: ${error1.hint || 'N/A'}`);
    } else {
      console.log(`   ✅ Succès: Order #${order1.order_number} trouvé`);
    }
  } catch (e) {
    console.log(`   ❌ Exception: ${e.message}`);
  }

  // Test 2: Syntaxe avec guillemets doubles échappés
  console.log('\nTest 2: .eq(\\"Order ID\\", orderId)');
  try {
    const { data: order2, error: error2 } = await supabase
      .from('orders')
      .select('*')
      .eq('"Order ID"', orderId)
      .single();
    
    if (error2) {
      console.log(`   ❌ Erreur: ${error2.message}`);
    } else {
      console.log(`   ✅ Succès: Order #${order2.order_number} trouvé`);
    }
  } catch (e) {
    console.log(`   ❌ Exception: ${e.message}`);
  }

  // Test 3: Utilisation de select avec filtre explicite
  console.log('\nTest 3: .select("*").filter("Order ID", "eq", orderId)');
  try {
    const { data: order3, error: error3 } = await supabase
      .from('orders')
      .select('*')
      .filter('Order ID', 'eq', orderId)
      .single();
    
    if (error3) {
      console.log(`   ❌ Erreur: ${error3.message}`);
    } else {
      console.log(`   ✅ Succès: Order #${order3.order_number} trouvé`);
    }
  } catch (e) {
    console.log(`   ❌ Exception: ${e.message}`);
  }

  // Test 4: Utilisation de select avec guillemets doubles dans le select
  console.log('\nTest 4: .select("*").eq(\`Order ID\`, orderId)');
  try {
    const { data: order4, error: error4 } = await supabase
      .from('orders')
      .select('*')
      .eq(`Order ID`, orderId)
      .single();
    
    if (error4) {
      console.log(`   ❌ Erreur: ${error4.message}`);
    } else {
      console.log(`   ✅ Succès: Order #${order4.order_number} trouvé`);
    }
  } catch (e) {
    console.log(`   ❌ Exception: ${e.message}`);
  }

  console.log('\n=== FIN ===');
}

testColumnWithSpace().catch(console.error);
