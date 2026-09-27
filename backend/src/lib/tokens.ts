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

// Two tabs or a flaky mobile network can legitimately present the same token twice
// within a few seconds; treat that as a race, not theft.
const REUSE_GRACE_MS = 30_000;

/**
 * Rotate a refresh token. Re-use of an already-rotated token (outside a short
 * grace window) means it leaked, so the whole token family is revoked.
 */
export async function rotateRefreshToken(token: string, userAgent?: string) {
  const record = await RefreshToken.findOne({ tokenHash: hash(token) });
  if (!record || record.expiresAt < new Date()) throw unauthorized("Session expired");
  if (record.revokedAt) {
    const familyActive = await RefreshToken.exists({ family: record.family, revokedAt: { $exists: false } });
    if (!familyActive || Date.now() - record.revokedAt.getTime() > REUSE_GRACE_MS) {
      await RefreshToken.updateMany({ family: record.family }, { revokedAt: new Date() });
      throw unauthorized("Session revoked");
    }
  } else {
    record.revokedAt = new Date();
    await record.save();
  }
  const userId = record.userId.toString();
  const refreshToken = await issueRefreshToken(userId, record.family, userAgent);
  return { userId, refreshToken, accessToken: signAccessToken(userId) };
}

const fileSecret = () => `${config.JWT_ACCESS_SECRET}:files`;

/**
 * Short-lived signed URL token for one attachment, so <img src> and mobile
 * image widgets can load files without putting the bearer token in the URL.
 */
export function signFileToken(attachmentId: string, ttlSeconds = 3600) {
  return jwt.sign({ aid: attachmentId }, fileSecret(), { expiresIn: ttlSeconds, issuer: "capture-hub-files" });
}

export function verifyFileToken(token: string, attachmentId: string) {
  try {
    const p = jwt.verify(token, fileSecret(), { issuer: "capture-hub-files" });
    return typeof p !== "string" && p.aid === attachmentId;
  } catch {
    return false;
  }
}

export async function revokeRefreshToken(token: string) {
  await RefreshToken.updateOne({ tokenHash: hash(token) }, { revokedAt: new Date() });
}
