const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const client = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: creds } = await client.from("shopify_credentials").select("*");
  console.log("Credentials:", creds);
}

check();
