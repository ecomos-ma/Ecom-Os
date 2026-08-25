import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL non trouvé');
  console.log('Variables disponibles:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey || '');

async function checkOrder() {
  const orderId = '7ee2ae4e-a97b-4bec-b59c-cc1d8008a8fa';
  console.log('=== VÉRIFICATION ORDER ===\n');
  console.log(`Order ID: ${orderId}\n`);

  // 1. Check if order exists
  console.log('1. Recherche de la commande...');
  const { data: order, error: ordError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (ordError) {
    console.log(`   ❌ Erreur: ${ordError.message}`);
    console.log(`   Code: ${ordError.code}`);
    console.log(`   Details: ${ordError.hint || 'N/A'}`);
  } else if (order) {
    console.log(`   ✅ Commande trouvée:`);
    console.log(`      ID: ${order.id}`);
    console.log(`      Order Number: ${order.order_number}`);
    console.log(`      Status: ${order.status}`);
    console.log(`      Customer: ${order.customer_name}`);
    console.log(`      Phone: ${order.phone}`);
    console.log(`      Workspace: ${order.workspace_id}`);
  } else {
    console.log(`   ⚠️  Aucune commande trouvée avec cet ID`);
  }

  // 2. Check whatsapp_queue entry
  console.log('\n2. Vérification de l\'entrée whatsapp_queue...');
  const { data: queueEntry, error: queueError } = await supabase
    .from('whatsapp_queue')
    .select('*')
    .eq('order_id', orderId)
    .single();

  if (queueError) {
    console.log(`   ❌ Erreur: ${queueError.message}`);
  } else if (queueEntry) {
    console.log(`   ✅ Entrée queue trouvée:`);
    console.log(`      ID: ${queueEntry.id}`);
    console.log(`      Status: ${queueEntry.status}`);
    console.log(`      Attempts: ${queueEntry.attempts}/${queueEntry.max_attempts}`);
    console.log(`      Last Error: ${queueEntry.last_error || 'N/A'}`);
    console.log(`      Workspace: ${queueEntry.workspace_id}`);
    console.log(`      Phone: ${queueEntry.phone}`);
  } else {
    console.log(`   ⚠️  Aucune entrée queue trouvée`);
  }

  // 3. Check whatsapp_settings for this workspace
  const workspaceId = '03826be0-e050-42d7-a030-a7d5a8d4f920';
  console.log('\n3. Vérification whatsapp_settings...');
  const { data: settings, error: settError } = await supabase
    .from('whatsapp_settings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single();

  if (settError) {
    console.log(`   ❌ Erreur: ${settError.message}`);
  } else if (settings) {
    console.log(`   ✅ Settings trouvés:`);
    console.log(`      Enabled: ${settings.enabled}`);
    console.log(`      Connection Status: ${settings.connection_status}`);
    console.log(`      Auto Confirmation: ${settings.auto_confirmation ?? settings.auto_order_confirmation ?? 'N/A'}`);
  } else {
    console.log(`   ⚠️  Aucun settings trouvé`);
  }

  console.log('\n=== FIN ===');
}

checkOrder().catch(console.error);
