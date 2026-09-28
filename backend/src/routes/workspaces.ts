import crypto from "node:crypto";
import { Router, type Request } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { config } from "../config.js";
import { forbidden, HttpError, notFound } from "../lib/errors.js";
import { objectId } from "../lib/validation.js";
import { ctx, requireAuth } from "../middleware/auth.js";
import { Invite, Membership, User, Workspace } from "../models/identity.js";

export const workspacesRouter = Router();

const INVITE_DAYS = 7;
export const hashInvite = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

function requireOwner(req: Request) {
  if (ctx(req).role !== "owner") throw forbidden("Only the workspace owner can do this");
}

/** Create a shared family workspace; the creator becomes its owner and switches to it. */
workspacesRouter.post("/workspaces", requireAuth, async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
  const { userId } = ctx(req);
  const ws = await Workspace.create({ name, kind: "family", ownerId: userId });
  await Membership.create({ workspaceId: ws._id, userId, role: "owner" });
  res.status(201).json({ id: ws._id, name: ws.name, kind: ws.kind, defaultCurrency: ws.defaultCurrency, role: "owner" });
});

/** Members of the active workspace (names for "Paid by", roles for settings). */
workspacesRouter.get("/workspaces/current/members", requireAuth, async (req, res) => {
  const { workspaceId } = ctx(req);
  const ws = await Workspace.findById(workspaceId).lean();
  const members = await Membership.find({ workspaceId }).lean();
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }).lean();
  res.json({
    workspace: ws && { id: ws._id, name: ws.name, kind: ws.kind },
    members: members.map((m) => {
      const u = users.find((x) => x._id.equals(m.userId));
      return { userId: m.userId, name: u?.name ?? "Former member", email: u?.email, role: m.role };
    }),
  });
});

const memberRole = z.object({ role: z.enum(["editor", "viewer"]) });

workspacesRouter.patch("/workspaces/current/members/:userId", requireAuth, async (req, res) => {
  requireOwner(req);
  const { role } = memberRole.parse(req.body);
  const target = String(req.params.userId);
  if (!objectId.safeParse(target).success) throw notFound("Member");
  const m = await Membership.findOne({ workspaceId: ctx(req).workspaceId, userId: target });
  if (!m) throw notFound("Member");
  if (m.role === "owner") throw new HttpError(400, "The owner's role can't be changed", "bad_request");
  m.role = role;
  await m.save();
  res.json({ ok: true });
});

/** Owner removes a member, or a member leaves (userId = "me"). The owner can't leave their own workspace. */
workspacesRouter.delete("/workspaces/current/members/:userId", requireAuth, async (req, res) => {
  const { workspaceId, userId } = ctx(req);
  const target = req.params.userId === "me" ? userId.toString() : String(req.params.userId);
  if (!objectId.safeParse(target).success) throw notFound("Member");
  if (target !== userId.toString()) requireOwner(req);
  const m = await Membership.findOne({ workspaceId, userId: target });
  if (!m) throw notFound("Member");
  if (m.role === "owner") throw new HttpError(400, "The owner can't leave or be removed", "bad_request");
  await m.deleteOne();
  // If this was their default workspace, fall back to one they still belong to.
  const u = await User.findById(target);
  if (u && u.defaultWorkspaceId?.equals(workspaceId)) {
    const other = await Membership.findOne({ userId: target });
    u.defaultWorkspaceId = other?.workspaceId;
    await u.save();
  }
  res.status(204).end();
});

/** Owner creates a single-use invite link (valid 7 days). Only family workspaces can be shared. */
workspacesRouter.post("/workspaces/current/invites", requireAuth, async (req, res) => {
  requireOwner(req);
  const { role } = memberRole.partial().parse(req.body);
  const { workspaceId, userId } = ctx(req);
  const ws = await Workspace.findById(workspaceId);
  if (ws?.kind !== "family") throw new HttpError(400, "Create a family workspace to invite others; your personal one stays private", "personal_workspace");
  const token = crypto.randomBytes(24).toString("base64url");
  await Invite.create({
    workspaceId,
    invitedBy: userId,
    tokenHash: hashInvite(token),
    role: role ?? "editor",
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  });
  res.status(201).json({ url: `${config.WEB_APP_URL}/invite/${token}`, expiresInDays: INVITE_DAYS });
});

export async function findValidInvite(token: string) {
  const invite = await Invite.findOne({ tokenHash: hashInvite(token) });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return null;
  return invite;
}

export async function acceptInvite(token: string, userId: Types.ObjectId) {
  const invite = await findValidInvite(token);
  if (!invite) throw new HttpError(410, "This invite link has expired or was already used", "invite_invalid");
  const existing = await Membership.findOne({ workspaceId: invite.workspaceId, userId });
  if (!existing) await Membership.create({ workspaceId: invite.workspaceId, userId, role: invite.role });
  invite.acceptedBy = userId;
  invite.acceptedAt = new Date();
  await invite.save();
  // Land them in the shared space.
  await User.updateOne({ _id: userId }, { defaultWorkspaceId: invite.workspaceId });
  return invite.workspaceId;
}

/** Public: what the invite is for (shown before sign-in/sign-up). */
workspacesRouter.get("/invites/:token", async (req, res) => {
  const invite = await findValidInvite(String(req.params.token));
  if (!invite) throw new HttpError(410, "This invite link has expired or was already used", "invite_invalid");
  const [ws, inviter] = await Promise.all([Workspace.findById(invite.workspaceId).lean(), User.findById(invite.invitedBy).lean()]);
  res.json({ workspaceName: ws?.name, invitedBy: inviter?.name, role: invite.role, expiresAt: invite.expiresAt });
});

workspacesRouter.post("/invites/:token/accept", requireAuth, async (req, res) => {
  const workspaceId = await acceptInvite(String(req.params.token), ctx(req).userId);
  res.json({ workspaceId });
});
