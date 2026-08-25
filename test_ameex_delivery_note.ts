// Test Ameex Delivery Note endpoints to diagnose the label creation issue
// Run with: deno run --allow-net --allow-env test_ameex_delivery_note.ts

const AMEEX_API_ID = Deno.env.get("AMEEX_API_ID");
const AMEEX_API_KEY = Deno.env.get("AMEEX_API_KEY");

if (!AMEEX_API_ID || !AMEEX_API_KEY) {
  console.error("AMEEX_API_ID and AMEEX_API_KEY must be set");
  Deno.exit(1);
}

const AMEEX_BASE_URL = "https://api.ameex.app";

console.log("=== TEST 1: Create Delivery Note ===");

const createNoteRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/DeliveryNotes/Action/Type/Add`, {
  method: "POST",
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: `business=${AMEEX_API_ID}`,
});

const createNoteText = await createNoteRes.text();
console.log("Status:", createNoteRes.status);
console.log("Raw Response:", createNoteText);

let deliveryNoteRef = null;
try {
  const createNoteData = JSON.parse(createNoteText);
  console.log("Parsed JSON:", JSON.stringify(createNoteData, null, 2));
  
  // Try to extract reference from various possible field names
  deliveryNoteRef = createNoteData.ref || createNoteData.reference || createNoteData.Ref || 
                   createNoteData.data?.ref || createNoteData.data?.reference || createNoteData.data?.Ref;
  console.log("Extracted reference:", deliveryNoteRef);
} catch (e) {
  console.log("Response is not JSON, trying to extract reference from text");
  // Try to extract reference from HTML/text response
  const refMatch = createNoteText.match(/ref[=:]\s*([A-Z0-9]+)/i);
  if (refMatch) {
    deliveryNoteRef = refMatch[1];
    console.log("Extracted reference from text:", deliveryNoteRef);
  }
}

if (!deliveryNoteRef) {
  console.error("No reference found in response - this might be the issue");
  Deno.exit(1);
}

console.log("\n=== TEST 2: Add Parcels to Delivery Note (FormData format) ===");

const testTrackingNumbers = ["SAMPLE_TRACKING_1"]; // Replace with real tracking number

const addParcelsFormData = new FormData();
addParcelsFormData.append("parcels[]", testTrackingNumbers[0]);

const addParcelsRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/DeliveryNotes/Action/Type/AddParcels?Ref=${encodeURIComponent(deliveryNoteRef)}`, {
  method: "POST",
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
  },
  body: addParcelsFormData,
});

const addParcelsText = await addParcelsRes.text();
console.log("Status:", addParcelsRes.status);
console.log("Raw Response:", addParcelsText);

try {
  const addParcelsData = JSON.parse(addParcelsText);
  console.log("Parsed JSON:", JSON.stringify(addParcelsData, null, 2));
} catch (e) {
  console.log("Response is not JSON");
}

console.log("\n=== TEST 3: Add Parcels to Delivery Note (JSON format) ===");

const addParcelsJsonRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/DeliveryNotes/Action/Type/AddParcels?Ref=${encodeURIComponent(deliveryNoteRef)}`, {
  method: "POST",
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ parcels: testTrackingNumbers }),
});

const addParcelsJsonText = await addParcelsJsonRes.text();
console.log("Status:", addParcelsJsonRes.status);
console.log("Raw Response:", addParcelsJsonText);

try {
  const addParcelsJsonData = JSON.parse(addParcelsJsonText);
  console.log("Parsed JSON:", JSON.stringify(addParcelsJsonData, null, 2));
} catch (e) {
  console.log("Response is not JSON");
}

console.log("\n=== TEST 4: Save Delivery Note ===");

const saveNoteRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/DeliveryNotes/Action/Type/Save?Ref=${encodeURIComponent(deliveryNoteRef)}`, {
  method: "PUT",
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
  },
});

const saveNoteText = await saveNoteRes.text();
console.log("Status:", saveNoteRes.status);
console.log("Raw Response:", saveNoteText);

try {
  const saveNoteData = JSON.parse(saveNoteText);
  console.log("Parsed JSON:", JSON.stringify(saveNoteData, null, 2));
} catch (e) {
  console.log("Response is not JSON");
}

console.log("\n=== TEST 5: Delete Delivery Note (cleanup) ===");

const deleteNoteRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/DeliveryNotes/Action/Type/Delete?Ref=${encodeURIComponent(deliveryNoteRef)}`, {
  method: "DELETE",
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
  },
});

const deleteNoteText = await deleteNoteRes.text();
console.log("Status:", deleteNoteRes.status);
console.log("Raw Response:", deleteNoteText);

export {};