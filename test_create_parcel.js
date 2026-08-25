// Create a new parcel for testing Pickup Note flow
// Run with: node test_create_parcel.js

const SUPABASE_URL = "https://wxfialbmyfkafobtkrde.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4ZmlhbGJteWZrYWZvYnRrcmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjE5NzY0NDksImV4cCI6MjAzNzU1MjQ0OX0.3X4Z8Q9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9";

async function test() {
  console.log("=== Create Parcel for #GS-20260704-1 ===");
  const parcelData = {
    order_number: "#GS-20260704-1",
    customer_name: "Test Customer",
    phone: "0611544486",
    address: "123 Test Street, Tanger",
    city: "Tanger",
    price: 100.0,
    workspace_id: "89fa65c7-5bc4-41d4-9322-0b39cd50bc33",
  };

  const createRes = await fetch(`${SUPABASE_URL}/functions/v1/coliaty-api/create-parcel`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parcelData),
  });

  const createText = await createRes.text();
  console.log("Status:", createRes.status);
  console.log("Raw Response:", createText);
  console.log("Parsed JSON:", JSON.stringify(JSON.parse(createText), null, 2));

  const createData = JSON.parse(createText);
  const parcelCode = createData.coliaty_parcel_code || createData.data?.package_code;
  console.log("Extracted parcel code:", parcelCode);
}

test().catch(console.error);
