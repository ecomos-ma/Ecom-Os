type VercelRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function header(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function reply(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

/** Same-origin transport only. Postgres still owns assignment, lease and RLS checks. */
export async function handleConfirmationSave(req: VercelRequest, res: VercelResponse, withItems = false) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") { reply(res, 405, { message: "Method not allowed" }); return; }

  const origin = header(req.headers.origin);
  const host = header(req.headers.host);
  try {
    if (origin && new URL(origin).host !== host) { reply(res, 403, { message: "Origin not allowed" }); return; }
  } catch { reply(res, 403, { message: "Origin not allowed" }); return; }

  const authorization = header(req.headers.authorization);
  if (!/^Bearer [A-Za-z0-9._~-]+$/.test(authorization)) {
    reply(res, 401, { message: "Sign in again before saving this order." });
    return;
  }

  let body: Record<string, unknown>;
  try {
    const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
    body = parsed as Record<string, unknown>;
    if (JSON.stringify(body).length > (withItems ? 16000 : 2048)
      || !uuid.test(String(body.p_workspace_id ?? ""))
      || !uuid.test(String(body.p_order_id ?? ""))
      || !uuid.test(String(body.p_lease_token ?? ""))
      || typeof body.p_claim_next !== "boolean"
      || (body.p_status !== null && typeof body.p_status !== "string")
      || (withItems && (!Array.isArray(body.p_items) || body.p_items.length < 1 || body.p_items.length > 20))
      || (!withItems && body.p_items !== undefined)) throw new Error("Invalid body");
  } catch { reply(res, 400, { message: "Invalid confirmation save request." }); return; }

  const upstreamUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!upstreamUrl || !publishableKey) {
    reply(res, 503, { message: "Confirmation service is not configured." });
    return;
  }
  try {
    const endpoint = new URL(withItems
      ? "/rest/v1/rpc/save_confirmation_order_with_items_v1"
      : "/rest/v1/rpc/save_confirmation_order_with_lease_v1", upstreamUrl);
    if (endpoint.protocol !== "https:") throw new Error("Insecure upstream");
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": publishableKey,
        "Authorization": authorization,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9_000),
      cache: "no-store",
    });
    const response = await upstream.text();
    res.statusCode = upstream.status;
    res.end(response);
  } catch {
    reply(res, 503, { message: "Save response unavailable. Check the order before retrying." });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleConfirmationSave(req, res);
}
