import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { forbidden, HttpError, unauthorized } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { Membership, User, type Role } from "../models/identity.js";

export interface AuthContext {
  userId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Authenticates the bearer token and resolves the active workspace
 * (X-Workspace-Id header, else the user's default). Every data route runs
 * behind this, and every query is scoped with `scope(req)`.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  const { sub } = verifyAccessToken(header.slice(7));
  if (!Types.ObjectId.isValid(sub)) throw unauthorized();

  const user = await User.findById(sub).select("defaultWorkspaceId").lean();
  if (!user) throw unauthorized();

  const requested = req.header("x-workspace-id");
  const workspaceId = requested && Types.ObjectId.isValid(requested) ? requested : user.defaultWorkspaceId;
  if (!workspaceId) throw forbidden("No workspace");

  const membership = await Membership.findOne({ userId: user._id, workspaceId }).lean();
  // Distinct code so clients can fall back to the default space (vs. a read-only 403).
  if (!membership) throw new HttpError(403, "Not a member of this workspace", "not_member");

  req.auth = {
    userId: user._id,
    workspaceId: new Types.ObjectId(String(workspaceId)),
    role: membership.role as Role,
  };
  next();
}

export function requireWrite(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role === "viewer") throw forbidden("Read-only access");
  next();
}

export function ctx(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** Base filter for records the current user may see in the active workspace. */
export function scope(req: Request) {
  const { workspaceId, userId } = ctx(req);
  return {
    workspaceId,
    deletedAt: { $exists: false },
    $or: [{ visibility: "workspace" }, { createdBy: userId }],
  };
}
