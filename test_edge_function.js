// Test Edge Function directly
// Run with: node test_edge_function.js

const SUPABASE_URL = "https://wxfialbmyfkafobtkrde.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4ZmlhbGJteWZrYWZvYnRrcmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjE5NzY0NDksImV4cCI6MjAzNzU1MjQ0OX0.3X4Z8Q9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9";

async function test() {
  console.log("=== TEST 1: Create Pickup Note ===");
  const createRes = await fetch(`${SUPABASE_URL}/functions/v1/coliaty-api/create-pickup-note`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const createText = await createRes.text();
  console.log("Status:", createRes.status);
  console.log("Raw Response:", createText);
  console.log("Parsed JSON:", JSON.stringify(JSON.parse(createText), null, 2));

  const createData = JSON.parse(createText);
  const reference = createData.reference;
  console.log("Extracted reference:", reference);

  if (!reference) {
    console.error("No reference found in response");
    process.exit(1);
  }

  console.log("\n=== TEST 2: Add Parcels to Pickup Note ===");
  const parcelCodes = ["TGR07266584QS"]; // Fresh parcel just created
  const addParcelsRes = await fetch(`${SUPABASE_URL}/functions/v1/coliaty-api/add-parcels-to-pickup-note`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reference,
      parcel_codes: parcelCodes,
    }),
  });

  const addParcelsText = await addParcelsRes.text();
  console.log("Status:", addParcelsRes.status);
  console.log("Raw Response:", addParcelsText);
  console.log("Parsed JSON:", JSON.stringify(JSON.parse(addParcelsText), null, 2));

  console.log("\n=== TEST 3: Generate Pickup Note Labels ===");
  const generateLabelsRes = await fetch(`${SUPABASE_URL}/functions/v1/coliaty-api/generate-pickup-note-labels?reference=${reference}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  console.log("Status:", generateLabelsRes.status);
  console.log("Content-Type:", generateLabelsRes.headers.get("content-type"));
  console.log("Content-Disposition:", generateLabelsRes.headers.get("content-disposition"));

  // Check if response is PDF (binary)
  const contentType = generateLabelsRes.headers.get("content-type") || "";
  if (contentType.includes("application/pdf")) {
    const pdfBuffer = await generateLabelsRes.arrayBuffer();
    console.log("Response is PDF binary data, size:", pdfBuffer.byteLength, "bytes");
    console.log("First 20 bytes (hex):", new Uint8Array(pdfBuffer.slice(0, 20)).toString());
  } else {
    const generateLabelsText = await generateLabelsRes.text();
    console.log("Raw Response:", generateLabelsText);
    console.log("Parsed JSON:", JSON.stringify(JSON.parse(generateLabelsText), null, 2));
  }
}

test().catch(console.error);
