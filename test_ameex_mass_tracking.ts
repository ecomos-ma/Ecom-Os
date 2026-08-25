// Test Ameex MassTracking endpoint with correct JSON format
// Run with: deno run --allow-net --allow-env test_ameex_mass_tracking.ts

const AMEEX_API_ID = Deno.env.get("AMEEX_API_ID");
const AMEEX_API_KEY = Deno.env.get("AMEEX_API_KEY");

if (!AMEEX_API_ID || !AMEEX_API_KEY) {
  console.error("AMEEX_API_ID and AMEEX_API_KEY must be set");
  Deno.exit(1);
}

const AMEEX_BASE_URL = "https://api.ameex.app";

console.log("=== TEST 1: Ameex MassTracking with JSON array format ===");

// Test with sample tracking numbers (replace with real ones for actual testing)
const testTrackingNumbers = ["SAMPLE_TRACKING_1", "SAMPLE_TRACKING_2"];

const massTrackingRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/ParcelsAction/Type/MassTracking`, {
  method: "POST",
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ codes: testTrackingNumbers }),
});

const massTrackingText = await massTrackingRes.text();
console.log("Status:", massTrackingRes.status);
console.log("Raw Response:", massTrackingText);

try {
  const massTrackingData = JSON.parse(massTrackingText);
  console.log("Parsed JSON:", JSON.stringify(massTrackingData, null, 2));
} catch (e) {
  console.log("Response is not JSON (might be HTML or other format)");
}

console.log("\n=== TEST 2: Ameex MassInfo with JSON array format ===");

const massInfoRes = await fetch(`${AMEEX_BASE_URL}/customer/Delivery/ParcelsAction/Type/MassInfo`, {
  method: "POST",
  headers: {
    "C-Api-Id": AMEEX_API_ID,
    "C-Api-Key": AMEEX_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ codes: testTrackingNumbers }),
});

const massInfoText = await massInfoRes.text();
console.log("Status:", massInfoRes.status);
console.log("Raw Response:", massInfoText);

try {
  const massInfoData = JSON.parse(massInfoText);
  console.log("Parsed JSON:", JSON.stringify(massInfoData, null, 2));
} catch (e) {
  console.log("Response is not JSON (might be HTML or other format)");
}

export {};