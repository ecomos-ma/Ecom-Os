import { MetaError, requiredEnv } from "./meta.ts";

type SignedRequest = { user_id?: string; [key: string]: unknown };

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyMetaSignedRequest(value: string): Promise<SignedRequest> {
  const [encodedSignature, encodedPayload, ...rest] = value.split(".");
  if (!encodedSignature || !encodedPayload || rest.length) {
    throw new MetaError("Invalid signed request", 400, "validation");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredEnv("META_APP_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = base64UrlToBytes(encodedSignature);
  const data = new TextEncoder().encode(encodedPayload);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  if (!timingSafeEqual(signature, expected)) {
    throw new MetaError("Invalid signed request", 400, "validation");
  }
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload)));
    if (!payload || typeof payload !== "object" || typeof payload.user_id !== "string" || !payload.user_id.trim()) {
      throw new Error("missing user");
    }
    return payload as SignedRequest;
  } catch {
    throw new MetaError("Invalid signed request", 400, "validation");
  }
}

export async function readMetaSignedRequest(req: Request): Promise<string> {
  const contentType = req.headers.get("content-type") ?? "";
  const text = await req.text();
  if (contentType.includes("application/json")) {
    const body = JSON.parse(text || "{}") as { signed_request?: unknown };
    if (typeof body.signed_request === "string") return body.signed_request;
  } else {
    const form = new URLSearchParams(text);
    const value = form.get("signed_request");
    if (value) return value;
  }
  throw new MetaError("Missing signed request", 400, "validation");
}
