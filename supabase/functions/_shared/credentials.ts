/** Server-only encryption for user-supplied provider keys. */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function credentialKey(): Promise<CryptoKey> {
  const encoded = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");
  if (!encoded) throw new Error("Credential encryption is not configured");

  const raw = base64ToBytes(encoded);
  if (raw.byteLength !== 32) throw new Error("Credential encryption key is invalid");

  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Stores nonce and ciphertext together so the database needs only one field. */
export async function encryptCredential(value: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, await credentialKey(), new TextEncoder().encode(value)),
  );
  const packed = new Uint8Array(nonce.byteLength + encrypted.byteLength);
  packed.set(nonce);
  packed.set(encrypted, nonce.byteLength);
  return bytesToBase64(packed);
}

export async function decryptCredential(packedValue: string): Promise<string> {
  const packed = base64ToBytes(packedValue);
  if (packed.byteLength <= 12) throw new Error("Stored credential is invalid");

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packed.slice(0, 12) },
    await credentialKey(),
    packed.slice(12),
  );
  return new TextDecoder().decode(plaintext);
}
