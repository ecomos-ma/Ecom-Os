const SUPABASE_FUNCTION_URL = "https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/anti-fake-orders";

type VercelRequest = {
  method?: string;
  url?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  statusCode: number;
  setHeader(name: string, value: string | number | string[]): void;
  end(body?: unknown): void;
};

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function clientIp(req: VercelRequest): string {
  const forwarded = firstHeader(req.headers["x-forwarded-for"]);
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "";
  return firstHeader(req.headers["x-real-ip"]).trim();
}

function copyHeader(req: VercelRequest, name: string): string | undefined {
  const value = firstHeader(req.headers[name.toLowerCase()]).trim();
  return value || undefined;
}

function serializeBody(body: unknown): string | undefined {
  if (body === undefined || body === null || body === "") return undefined;
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = (req.method || "GET").toUpperCase();
  const requestUrl = new URL(req.url || "/api/anti-fake-orders", "https://www.ecomos.ma");
  const target = new URL(SUPABASE_FUNCTION_URL);
  target.search = requestUrl.search;

  const headers = new Headers();
  for (const name of ["origin", "referer", "content-type", "accept", "authorization"]) {
    const value = copyHeader(req, name);
    if (value) headers.set(name, value);
  }

  const ip = clientIp(req);
  if (ip) headers.set("x-ecomos-client-ip", ip);

  const body = method === "GET" || method === "HEAD" || method === "OPTIONS" ? undefined : serializeBody(req.body);
  const upstream = await fetch(target, { method, headers, body });

  res.statusCode = upstream.status;
  // Only forward the headers the storefront needs. Passing through Supabase's
  // gateway cookies and transfer headers makes Vercel treat this streamed
  // response as empty even though the upstream body is present.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Vary", "Origin, Referer, X-Forwarded-For, X-Real-IP");
  // Forward the JavaScript/JSON payload as text. This keeps the Edge
  // Function response intact on Vercel's Node serverless runtime.
  const responseBody = await upstream.text();
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/plain; charset=utf-8");
  res.setHeader("Content-Length", String(Buffer.byteLength(responseBody, "utf8")));
  res.end(responseBody);
}
