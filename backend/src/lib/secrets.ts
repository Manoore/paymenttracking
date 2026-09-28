import crypto from "node:crypto";
import { config } from "../config.js";

/**
 * Encrypts third-party API keys at rest (AES-256-GCM). The key comes from
 * SECRETS_KEY when set; otherwise it is derived from JWT_REFRESH_SECRET so
 * nothing extra is required to get started. Set SECRETS_KEY before rotating
 * JWT secrets, or saved API keys will need to be entered again.
 */
function masterKey() {
  const source = config.SECRETS_KEY ?? config.JWT_REFRESH_SECRET;
  return Buffer.from(crypto.hkdfSync("sha256", source, "capture-hub", "api-key-encryption", 32));
}

export function encryptSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string) {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unsupported secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** "sk-…abcd": enough to recognise a key without revealing it. */
export const maskKey = (key: string) => `${key.slice(0, 3)}…${key.slice(-4)}`;
