const SUPABASE_FUNCTION_URL = "https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/theme-domain-licensing";

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  statusCode: number;
  setHeader(name: string, value: string | number | string[]): void;
  end(body?: unknown): void;
};

function header(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  const method = (req.method || "GET").toUpperCase();
  if (method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (method !== "POST") { res.statusCode = 405; res.end(JSON.stringify({ allowed: false })); return; }

  try {
    const forwarded = header(req.headers["x-forwarded-for"]).split(",")[0]?.trim() || header(req.headers["x-real-ip"]).trim();
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) { res.statusCode = 400; res.end(JSON.stringify({ allowed: false })); return; }
    const upstream = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(forwarded ? { "x-ecomos-client-ip": forwarded } : {}),
      },
      body: JSON.stringify({ ...(body as Record<string, unknown>), action: "validate" }),
    });
    res.statusCode = upstream.status;
    res.end(await upstream.text());
  } catch {
    res.statusCode = 503;
    res.end(JSON.stringify({ allowed: false }));
  }
}
