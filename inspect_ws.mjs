import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectWorkspace() {
  const { data: ws } = await supabase.from("workspaces").select("id, name, carrier").eq("id", "03826be0-e050-42d7-a030-a7d5a8d4f920").single();
  console.log("Workspace details:", ws);
}

inspectWorkspace();
