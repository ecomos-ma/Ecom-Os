import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import * as dotenv from "npm:dotenv";

dotenv.config();

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: creds } = await client.from("shopify_credentials").select("*");
  console.log("Credentials:", creds);

  const { data: subs } = await client.from("shopify_webhook_subscriptions").select("*");
  console.log("Subscriptions:", subs);
}

check();
