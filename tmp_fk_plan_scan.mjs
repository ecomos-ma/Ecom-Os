import { createClient } from '@supabase/supabase-js';
const url = process.env.VITE_SUPABASE_URL || 'https://wxfialbmyfkafobtkrde.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('missing env');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const sql = `
WITH fk AS (
  SELECT
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule,
    rc.update_rule,
    tc.constraint_name
  FROM information_schema.referential_constraints rc
  JOIN information_schema.table_constraints tc
    ON tc.constraint_name = rc.constraint_name
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = rc.constraint_name
  WHERE ccu.table_schema = 'public' AND ccu.table_name = 'subscription_plans'
)
SELECT * FROM fk ORDER BY table_name, column_name;
`;

const { data, error } = await supabase.rpc('exec_sql', { sql });
console.log(JSON.stringify({ data, error }, null, 2));
