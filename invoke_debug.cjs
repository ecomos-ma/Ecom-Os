require("dotenv").config();

async function check() {
  const url = process.env.VITE_SUPABASE_URL + "/functions/v1/shopify-debug";
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
    }
  });
  
  const text = await res.text();
  console.log("Response:", text);
}

check();
