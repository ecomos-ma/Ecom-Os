import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function testFrontendAccess() {
  console.log("=== 3. Testing Frontend Route Access ===\n");

  // Test accessing the route directly (should redirect to login if not authenticated)
  console.log("Test: Direct route access without authentication");
  console.log("This requires manual browser testing at http://localhost:8081/internal-founder-access");
  console.log("Expected behavior: Redirect to /login");
  
  // Get a list of users to test with
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, email, role, full_name')
    .limit(5);
  
  if (error) {
    console.error("Error fetching users:", error);
  } else {
    console.log("\nAvailable test users (for manual testing):");
    users.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email} (${user.role}) - ${user.full_name || 'No name'}`);
    });
    console.log("\nInstructions for manual testing:");
    console.log("1. Log in with any user above (not ziadennachat5@gmail.com)");
    console.log("2. Navigate to http://localhost:8081/internal-founder-access");
    console.log("3. Expected: Silent redirect to /dashboard");
    console.log("4. Log out and try the URL again");
    console.log("5. Expected: Redirect to /login");
  }
}

testFrontendAccess();
