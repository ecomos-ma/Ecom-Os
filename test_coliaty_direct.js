// Direct test of Coliaty API (bypassing Edge Function)
// Run with: node test_coliaty_direct.js

const COLIATY_PUBLIC_KEY = "23f820cc0c7659fc54c126e7403517fb924082075908fa8b4a0be5ff26fd6430";
const COLIATY_SECRET_KEY = "de78b9483d0bcc461b31ebcaec1dc41821ce4e71a62c71bd7e54931e2d5a81de";
const COLIATY_BASE_URL = "https://customer-api-v1.coliaty.com";

const authHeader = `Bearer ${COLIATY_PUBLIC_KEY}:${COLIATY_SECRET_KEY}`;

async function test() {
  console.log("=== TEST 1: Create Pickup Note ===");
  const createRes = await fetch(`${COLIATY_BASE_URL}/pickup-note/create`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
    },
  });

  const createText = await createRes.text();
  console.log("Status:", createRes.status);
  console.log("Raw Response:", createText);
  console.log("Parsed JSON:", JSON.stringify(JSON.parse(createText), null, 2));

  const createData = JSON.parse(createText);
  const reference = createData.data?.reference || createData.reference || createData.ref;
  console.log("Extracted reference:", reference);

  if (!reference) {
    console.error("No reference found in response");
    process.exit(1);
  }

  console.log("\n=== TEST 2: Add Parcels to Pickup Note ===");
  const parcelCodes = ["AZM04263480BD", "afr07264153ZT", "CSA07269939WB", "CSA07264413PF"];
  const addParcelsRes = await fetch(`${COLIATY_BASE_URL}/pickup-note/add-parcels`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
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
  const generateLabelsRes = await fetch(`${COLIATY_BASE_URL}/pickup-note/${reference}/generate-labels`, {
    method: "GET",
    headers: {
      "Authorization": authHeader,
    },
  });

  const generateLabelsText = await generateLabelsRes.text();
  console.log("Status:", generateLabelsRes.status);
  console.log("Raw Response:", generateLabelsText);
  console.log("Parsed JSON:", JSON.stringify(JSON.parse(generateLabelsText), null, 2));

  const generateLabelsData = JSON.parse(generateLabelsText);
  const pdfUrl = generateLabelsData.data?.pdf_url || generateLabelsData.pdf_url || generateLabelsData.url;
  console.log("Extracted PDF URL:", pdfUrl);
}

test().catch(console.error);
