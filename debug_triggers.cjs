const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await client.rpc("pg_query", {
    query: `SELECT tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relname = 'orders' AND NOT t.tgisinternal`
  });
  console.log("error:", error?.message);
  console.log("data:", JSON.stringify(data, null, 2));
}

check();
