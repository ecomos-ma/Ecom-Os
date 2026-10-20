import {
  activeConnection,
  activeLegacyConnection,
  authenticateRequest,
  corsHeaders,
  errorResponse,
  jsonResponse,
  MetaError,
  metaUploadFile,
  metaVideoFinish,
  metaVideoStart,
  metaVideoTransfer,
  normalizeAdAccountId,
  requiredEnv,
  resolveActiveWorkspace,
  serviceClient,
  writeActionLog,
} from "../_shared/meta.ts";

type VideoTicket = { workspaceId: string; userId: string; accountId: string; source: "oauth" | "legacy"; sessionId: string; videoId: string; fileSize: number; expiresAt: number };
function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function ticketKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(requiredEnv("META_TOKEN_ENCRYPTION_KEY")), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signTicket(ticket: VideoTicket): Promise<string> {
  const body = encode(new TextEncoder().encode(JSON.stringify(ticket)));
  const signature = await crypto.subtle.sign("HMAC", await ticketKey(), new TextEncoder().encode(body));
  return `${body}.${encode(new Uint8Array(signature))}`;
}
async function verifyTicket(value: string, workspaceId: string, userId: string, accountId: string, source: "oauth" | "legacy"): Promise<VideoTicket> {
  const [body, signature] = value.split(".");
  if (!body || !signature || body.length > 2000) throw new MetaError("Video upload session is invalid", 403, "permission");
  let ticket: VideoTicket;
  try {
    const decodedSignature = decode(signature);
    const signatureBytes = new Uint8Array(decodedSignature.byteLength);
    signatureBytes.set(decodedSignature);
    const valid = await crypto.subtle.verify("HMAC", await ticketKey(), signatureBytes, new TextEncoder().encode(body));
    if (!valid) throw new Error();
    ticket = JSON.parse(new TextDecoder().decode(decode(body))) as VideoTicket;
  } catch { throw new MetaError("Video upload session is invalid", 403, "permission"); }
  if (ticket.workspaceId !== workspaceId || ticket.userId !== userId || ticket.accountId !== accountId || ticket.source !== source || ticket.expiresAt < Date.now() || !/^\d+$/.test(ticket.sessionId) || !/^\d+$/.test(ticket.videoId))
    throw new MetaError("Video upload session has expired or is not authorized", 403, "permission");
  return ticket;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);
  try {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > 19 * 1024 * 1024)
      throw new MetaError("Creative upload exceeds the 18 MB file limit", 413, "validation");
    const client = serviceClient();
    const user = await authenticateRequest(req, client);
    const { workspaceId } = await resolveActiveWorkspace(client, user.id, true);
    const form = await req.formData();
    const source = String(form.get("source") ?? "oauth");
    if (source !== "oauth" && source !== "legacy") throw new MetaError("Unknown Meta connection source", 400, "validation");
    const connection = source === "legacy"
      ? await activeLegacyConnection(client, workspaceId)
      : await activeConnection(client, workspaceId);
    const accountId = normalizeAdAccountId(form.get("ad_account_id"));
    const phase = String(form.get("phase") ?? "single");
    if (source === "legacy") {
      if (accountId !== (connection as Awaited<ReturnType<typeof activeLegacyConnection>>).adAccountId)
        throw new MetaError("Ad account is not available to this workspace", 403, "permission");
    } else {
      const { data: account } = await client.from("meta_ad_accounts")
        .select("meta_ad_account_id")
        .eq("workspace_id", workspaceId)
        .eq("connection_id", connection.id)
        .eq("meta_ad_account_id", accountId)
        .eq("is_enabled", true)
        .maybeSingle();
      if (!account) throw new MetaError("Ad account is not available to this workspace", 403, "permission");
    }
    if (phase === "start") {
      const fileSize = Number(form.get("file_size"));
      const result = await metaVideoStart(connection.accessToken, accountId, fileSize, source !== "legacy");
      const ticket = await signTicket({ workspaceId, userId: user.id, accountId, source, sessionId: result.upload_session_id,
        videoId: result.video_id, fileSize, expiresAt: Date.now() + 2 * 60 * 60_000 });
      return jsonResponse(req, { success: true, ticket, start_offset: result.start_offset, end_offset: result.end_offset });
    }
    if (phase === "transfer") {
      const ticket = await verifyTicket(String(form.get("ticket") ?? ""), workspaceId, user.id, accountId, source);
      const chunk = form.get("file");
      if (!(chunk instanceof File)) throw new MetaError("Choose a video chunk", 400, "validation");
      const startOffset = Number(form.get("start_offset"));
      if (!Number.isSafeInteger(startOffset) || startOffset < 0 || startOffset + chunk.size > ticket.fileSize)
        throw new MetaError("Video chunk is outside the declared file size", 400, "validation");
      const result = await metaVideoTransfer(connection.accessToken, accountId,
        ticket.sessionId, startOffset, chunk, source !== "legacy");
      return jsonResponse(req, { success: true, ...result });
    }
    if (phase === "finish") {
      const ticket = await verifyTicket(String(form.get("ticket") ?? ""), workspaceId, user.id, accountId, source);
      const name = String(form.get("name") ?? "Creative video").slice(0, 120);
      await metaVideoFinish(connection.accessToken, accountId, ticket.sessionId, name, source !== "legacy");
      await writeActionLog(client, {
        workspaceId, actorUserId: user.id, source: "launch_studio",
        action: "upload_creative_to_meta", entityType: "creative",
        entityId: ticket.videoId, result: "success",
        after: { media_type: "video", name, size: ticket.fileSize },
      });
      return jsonResponse(req, { success: true, media_type: "video", video_id: ticket.videoId, name });
    }
    if (phase !== "single") throw new MetaError("Unknown creative upload phase", 400, "validation");
    const file = form.get("file");
    if (!(file instanceof File)) throw new MetaError("Choose a creative file", 400, "validation");
    const uploaded = await metaUploadFile(connection.accessToken, accountId, file, source !== "legacy");
    await writeActionLog(client, {
      workspaceId,
      actorUserId: user.id,
      source: "launch_studio",
      action: "upload_creative_to_meta",
      entityType: "creative",
      entityId: uploaded.image_hash ?? uploaded.video_id,
      result: "success",
      after: { media_type: uploaded.media_type, name: file.name.slice(0, 120), size: file.size },
    });
    return jsonResponse(req, { success: true, name: file.name.slice(0, 120), ...uploaded });
  } catch (error) {
    return errorResponse(req, error);
  }
});
