// Test Ameex PDF endpoints to check if they support PDF format
// Run with: deno run --allow-net --allow-env test_ameex_pdf_endpoints.ts

const AMEEX_API_ID = Deno.env.get("AMEEX_API_ID");
const AMEEX_API_KEY = Deno.env.get("AMEEX_API_KEY");

if (!AMEEX_API_ID || !AMEEX_API_KEY) {
  console.error("AMEEX_API_ID and AMEEX_API_KEY must be set");
  Deno.exit(1);
}

const AMEEX_BASE_URL = "https://api.ameex.app";

console.log("=== TEST 1: Check current Labels endpoint (HTML format) ===");

// Use the reference from the user's example
const testRef = "BL-200826-011668010-31-B-28534";

const labelsHtmlRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/DeliveryNotes/Print/Type/Labels?Ref=${encodeURIComponent(testRef)}&LabelType=Label_A4`, {
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
  },
});

const labelsHtmlText = await labelsHtmlRes.text();
console.log("Status:", labelsHtmlRes.status);
console.log("Content-Type:", labelsHtmlRes.headers.get("content-type"));
console.log("Response length:", labelsHtmlText.length);
console.log("First 200 chars:", labelsHtmlText.substring(0, 200));

console.log("\n=== TEST 2: Try with PDF format parameter ===");

const labelsPdfRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/DeliveryNotes/Print/Type/Labels?Ref=${encodeURIComponent(testRef)}&LabelType=Label_A4&format=pdf`, {
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
  },
});

const labelsPdfText = await labelsPdfRes.text();
console.log("Status:", labelsPdfRes.status);
console.log("Content-Type:", labelsPdfRes.headers.get("content-type"));
console.log("Response length:", labelsPdfText.length);
console.log("First 200 chars:", labelsPdfText.substring(0, 200));

console.log("\n=== TEST 3: Try with PDF endpoint variant ===");

const labelsPdfVariantRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/DeliveryNotes/Print/Type/LabelsPdf?Ref=${encodeURIComponent(testRef)}&LabelType=Label_A4`, {
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
  },
});

const labelsPdfVariantText = await labelsPdfVariantRes.text();
console.log("Status:", labelsPdfVariantRes.status);
console.log("Content-Type:", labelsPdfVariantRes.headers.get("content-type"));
console.log("Response length:", labelsPdfVariantText.length);
console.log("First 200 chars:", labelsPdfVariantText.substring(0, 200));

console.log("\n=== TEST 4: Check Note endpoint (might have PDF option) ===");

const noteHtmlRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/DeliveryNotes/Print/Type/Note?Ref=${encodeURIComponent(testRef)}`, {
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
  },
});

const noteHtmlText = await noteHtmlRes.text();
console.log("Status:", noteHtmlRes.status);
console.log("Content-Type:", noteHtmlRes.headers.get("content-type"));
console.log("Response length:", noteHtmlText.length);
console.log("First 200 chars:", noteHtmlText.substring(0, 200));

console.log("\n=== TEST 5: Try Note with PDF format ===");

const notePdfRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/DeliveryNotes/Print/Type/Note?Ref=${encodeURIComponent(testRef)}&format=pdf`, {
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
  },
});

const notePdfText = await notePdfRes.text();
console.log("Status:", notePdfRes.status);
console.log("Content-Type:", notePdfRes.headers.get("content-type"));
console.log("Response length:", notePdfText.length);
console.log("First 200 chars:", notePdfText.substring(0, 200));

console.log("\n=== TEST 6: Try alternative PDF endpoint paths ===");

const alternativePaths = [
  `/customer/Delivery/DeliveryNotes/Print/Labels/${encodeURIComponent(testRef)}`,
  `/customer/Delivery/DeliveryNotes/Print/LabelsPdf/${encodeURIComponent(testRef)}`,
  `/customer/Delivery/DeliveryNotes/Pdf/${encodeURIComponent(testRef)}`,
  `/customer/Delivery/DeliveryNotes/Download/${encodeURIComponent(testRef)}`,
];

for (const path of alternativePaths) {
  try {
    const res = await fetch(`${AMEEX_BASE_URL}${path}`, {
      headers: {
        "C-Api-Id": AMEEX_API_ID,
        "C-Api-Key": AMEEX_API_KEY,
      },
    });
    const text = await res.text();
    console.log(`Path: ${path}`);
    console.log(`  Status: ${res.status}`);
    console.log(`  Content-Type: ${res.headers.get("content-type")}`);
    console.log(`  Length: ${text.length}`);
    if (res.status === 200) {
      console.log(`  First 100 chars: ${text.substring(0, 100)}`);
    }
  } catch (error) {
    console.log(`Path: ${path} - Error: ${error}`);
  }
}

export {};