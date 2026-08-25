import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: {
      schema: 'public'
    }
  }
);

async function applyMigration() {
  console.log("=== APPLYING YOUCAN SEQUENTIAL ORDER NUMBERING MIGRATION ===\n");

  try {
    // Step 1: Create the counter table
    console.log("1. Creating youcan_order_counters table...");
    const { error: tableError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS public.youcan_order_counters (
          workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
          next_sequence_number integer NOT NULL DEFAULT 1,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        
        ALTER TABLE public.youcan_order_counters ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Service role can manage youcan counters" ON public.youcan_order_counters;
        
        CREATE POLICY "Service role can manage youcan counters"
          ON public.youcan_order_counters FOR ALL
          USING (auth.role() = 'service_role');
      `
    });

    if (tableError && !tableError.message.includes('already exists')) {
      console.error("❌ Table creation error:", tableError);
    } else {
      console.log("✅ Table created or already exists");
    }

    // Step 2: Create the function
    console.log("\n2. Creating get_next_youcan_order_number function...");
    const { error: funcError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE OR REPLACE FUNCTION public.get_next_youcan_order_number(p_workspace_id uuid)
        RETURNS text AS $$
        DECLARE
          v_next_num integer;
          v_order_number text;
        BEGIN
          INSERT INTO public.youcan_order_counters (workspace_id, next_sequence_number)
          VALUES (p_workspace_id, 1)
          ON CONFLICT (workspace_id) 
          DO UPDATE SET 
            next_sequence_number = youcan_order_counters.next_sequence_number + 1,
            updated_at = now()
          RETURNING next_sequence_number INTO v_next_num;
          
          v_order_number := 'YC-' || v_next_num::text;
          
          RETURN v_order_number;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        
        CREATE INDEX IF NOT EXISTS youcan_order_counters_workspace_idx 
          ON public.youcan_order_counters(workspace_id);
          
        COMMENT ON FUNCTION public.get_next_youcan_order_number IS 
          'Atomically generates the next sequential YouCan order number for a workspace. 
          Returns format: YC-{number}. Each workspace has its own independent sequence starting from 1.';
      `
    });

    if (funcError) {
      console.error("❌ Function creation error:", funcError);
    } else {
      console.log("✅ Function created successfully");
    }

    // Step 3: Verify the migration
    console.log("\n3. Verifying migration...");
    
    // Test the function with a workspace ID
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1);
    
    if (workspaces && workspaces.length > 0) {
      const testWorkspaceId = workspaces[0].id;
      console.log(`Testing with workspace: ${testWorkspaceId}`);
      
      const { data: orderNumber, error: testError } = await supabase
        .rpc('get_next_youcan_order_number', { p_workspace_id: testWorkspaceId });
      
      if (testError) {
        console.error("❌ Function test failed:", testError);
      } else {
        console.log(`✅ Function works! Generated order number: ${orderNumber}`);
      }
    } else {
      console.log("⚠️  No workspaces found to test function");
    }

    console.log("\n=== MIGRATION COMPLETE ===");
    console.log("Please run the SQL in apply_youcan_counter.sql in Supabase SQL Editor if the automated migration failed.");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    console.log("\nPlease manually run the SQL in apply_youcan_counter.sql in your Supabase SQL Editor.");
  }
}

applyMigration();