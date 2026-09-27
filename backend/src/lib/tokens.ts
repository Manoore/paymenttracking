import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../config.js";
import { RefreshToken } from "../models/identity.js";
import { unauthorized } from "./errors.js";

export interface AccessClaims {
  sub: string;
}

export function signAccessToken(userId: string) {
  return jwt.sign({ sub: userId } satisfies AccessClaims, config.JWT_ACCESS_SECRET, {
    expiresIn: config.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
    issuer: "capture-hub",
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, { issuer: "capture-hub" });
    if (typeof payload === "string" || !payload.sub) throw new Error("bad payload");
    return { sub: payload.sub };
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}

const hash = (token: string) =>
  crypto.createHmac("sha256", config.JWT_REFRESH_SECRET).update(token).digest("hex");

/** Refresh tokens are opaque random strings; only their HMAC is stored. */
export async function issueRefreshToken(userId: string, family?: string, userAgent?: string) {
  const token = crypto.randomBytes(48).toString("base64url");
  await RefreshToken.create({
    userId,
    tokenHash: hash(token),
    family: family ?? crypto.randomUUID(),
    expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    userAgent,
  });
  return token;
}

/**
 * Rotate a refresh token. Re-use of an already-rotated token means it leaked,
 * so the whole token family (that login session) is revoked.
 */
export async function rotateRefreshToken(token: string, userAgent?: string) {
  const record = await RefreshToken.findOne({ tokenHash: hash(token) });
  if (!record || record.expiresAt < new Date()) throw unauthorized("Session expired");
  if (record.revokedAt) {
    await RefreshToken.updateMany({ family: record.family }, { revokedAt: new Date() });
    throw unauthorized("Session revoked");
  }
  record.revokedAt = new Date();
  await record.save();
  const userId = record.userId.toString();
  const refreshToken = await issueRefreshToken(userId, record.family, userAgent);
  return { userId, refreshToken, accessToken: signAccessToken(userId) };
}

export async function revokeRefreshToken(token: string) {
  await RefreshToken.updateOne({ tokenHash: hash(token) }, { revokedAt: new Date() });
}
