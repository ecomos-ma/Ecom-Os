import { HttpError } from "./security.ts";

export function shopifyOAuthConfig() {
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET")?.trim();
  const redirectUri = Deno.env.get("SHOPIFY_REDIRECT_URI")?.trim();
  
  if (!clientId || !clientSecret || !redirectUri) {
    throw new HttpError("Shopify OAuth client is misconfigured", 503);
  }
  return { clientId, clientSecret, redirectUri };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encryptionKeyBytes(): Uint8Array {
  const configured = Deno.env.get("SHOPIFY_TOKEN_ENCRYPTION_KEY")?.trim();
  if (!configured) throw new HttpError("Shopify credential encryption is misconfigured", 503);
  if (/^[0-9a-f]{64}$/i.test(configured)) {
    return Uint8Array.from(configured.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
  }
  const decoded = base64ToBytes(configured);
  if (decoded.length !== 32) throw new HttpError("Shopify credential encryption key is invalid length", 503);
  return decoded;
}

async function encryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(encryptionKeyBytes()).buffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptShopifySecret(secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(secret),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptShopifySecret(envelope: string): Promise<string> {
  const [version, ivValue, ciphertextValue] = envelope.split(".");
  if (version !== "v1" || !ivValue || !ciphertextValue) throw new HttpError("Stored Shopify credential is invalid", 503);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Uint8Array.from(base64ToBytes(ivValue)).buffer },
      await encryptionKey(),
      Uint8Array.from(base64ToBytes(ciphertextValue)).buffer,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new HttpError("Stored Shopify credential cannot be decrypted", 503);
  }
}
