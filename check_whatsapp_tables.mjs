import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkWhatsAppTables() {
  console.log('=== DIAGNOSTIC TABLES WHATSAPP ===\n');

  // 1. Check if tables exist
  console.log('1. Vérification de l\'existence des tables...');
  const tables = ['whatsapp_settings', 'whatsapp_queue', 'whatsapp_messages'];
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`   ❌ ${table}: ERREUR - ${error.message}`);
      } else {
        console.log(`   ✅ ${table}: existe`);
      }
    } catch (e) {
      console.log(`   ❌ ${table}: ERREUR - ${e.message}`);
    }
  }

  // 2. Check whatsapp_settings data
  console.log('\n2. Données whatsapp_settings:');
  try {
    const { data: settings, error } = await supabase
      .from('whatsapp_settings')
      .select('*');
    
    if (error) {
      console.log(`   ❌ Erreur: ${error.message}`);
    } else if (!settings || settings.length === 0) {
      console.log('   ⚠️  Table vide (aucun workspace configuré)');
    } else {
      console.log(`   ✅ ${settings.length} workspace(s) configuré(s):`);
      settings.forEach(s => {
        console.log(`      - Workspace: ${s.workspace_id}`);
        console.log(`        Enabled: ${s.enabled}`);
        console.log(`        Connection Status: ${s.connection_status}`);
        console.log(`        Auto Confirmation: ${s.auto_confirmation ?? s.auto_order_confirmation ?? 'N/A'}`);
        console.log(`        Connected Phone: ${s.connected_phone || 'N/A'}`);
        console.log(`        Last Connected: ${s.last_connected_at || 'N/A'}`);
        console.log(`        Last Error: ${s.last_error || 'N/A'}`);
      });
    }
  } catch (e) {
    console.log(`   ❌ Erreur: ${e.message}`);
  }

  // 3. Check whatsapp_queue data
  console.log('\n3. Données whatsapp_queue:');
  try {
    const { data: queue, error } = await supabase
      .from('whatsapp_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.log(`   ❌ Erreur: ${error.message}`);
    } else if (!queue || queue.length === 0) {
      console.log('   ⚠️  Queue vide (aucun message en attente)');
    } else {
      console.log(`   ✅ ${queue.length} job(s) récent(s):`);
      queue.forEach(q => {
        console.log(`      - Order: ${q.order_id}`);
        console.log(`        Phone: ${q.phone}`);
        console.log(`        Type: ${q.message_type}`);
        console.log(`        Status: ${q.status}`);
        console.log(`        Scheduled: ${q.scheduled_for}`);
        console.log(`        Attempts: ${q.attempts}/${q.max_attempts}`);
        console.log(`        Last Error: ${q.last_error || 'N/A'}`);
      });
    }
  } catch (e) {
    console.log(`   ❌ Erreur: ${e.message}`);
  }

  // 4. Check whatsapp_messages data
  console.log('\n4. Données whatsapp_messages:');
  try {
    const { data: messages, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.log(`   ❌ Erreur: ${error.message}`);
    } else if (!messages || messages.length === 0) {
      console.log('   ⚠️  Aucun message envoyé/reçu');
    } else {
      console.log(`   ✅ ${messages.length} message(s) récent(s):`);
      messages.forEach(m => {
        console.log(`      - Order: ${m.order_id || 'N/A'}`);
        console.log(`        Phone: ${m.phone}`);
        console.log(`        Direction: ${m.direction}`);
        console.log(`        Status: ${m.status}`);
        console.log(`        Created: ${m.created_at}`);
      });
    }
  } catch (e) {
    console.log(`   ❌ Erreur: ${e.message}`);
  }

  // 5. Check if trigger exists
  console.log('\n5. Vérification du trigger on_new_order_whatsapp:');
  try {
    const { data: triggerInfo, error } = await supabase
      .rpc('check_trigger_exists', { 
        p_trigger_name: 'on_new_order_whatsapp',
        p_table_name: 'orders'
      });
    
    if (error) {
      console.log('   ⚠️  Impossible de vérifier (fonction check_trigger_exists non disponible)');
    } else {
      console.log(`   ${triggerInfo ? '✅ Trigger existe' : '❌ Trigger inexistant'}`);
    }
  } catch (e) {
    console.log('   ⚠️  Impossible de vérifier (fonction check_trigger_exists non disponible)');
  }

  console.log('\n=== FIN DU DIAGNOSTIC ===');
}

checkWhatsAppTables().catch(console.error);
