import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError, unauthorized } from "../lib/errors.js";
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken, signAccessToken } from "../lib/tokens.js";
import { ctx, requireAuth } from "../middleware/auth.js";
import { Membership, RefreshToken, User, Workspace } from "../models/identity.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: config.NODE_ENV === "test" ? 1000 : 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(10, "Password must be at least 10 characters").max(200);

const registerBody = z.object({ email, password, name: z.string().trim().min(1).max(100) });
const loginBody = z.object({ email, password: z.string().min(1).max(200) });
const refreshBody = z.object({ refreshToken: z.string().min(20) });

// Constant-time-ish failure path so login timing doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 12);

async function sessionFor(userId: string, userAgent?: string) {
  return {
    accessToken: signAccessToken(userId),
    refreshToken: await issueRefreshToken(userId, undefined, userAgent),
  };
}

async function publicUser(userId: unknown) {
  const user = await User.findById(userId).lean();
  if (!user) throw unauthorized();
  const memberships = await Membership.find({ userId: user._id }).lean();
  const workspaces = await Workspace.find({ _id: { $in: memberships.map((m) => m.workspaceId) } }).lean();
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    timezone: user.timezone ?? null,
    preferences: {
      emailReminders: user.preferences?.emailReminders ?? true,
      reminderEmail: user.preferences?.reminderEmail ?? null,
      weeklyDigest: user.preferences?.weeklyDigest ?? true,
    },
    createdAt: user.createdAt,
    defaultWorkspaceId: user.defaultWorkspaceId,
    workspaces: workspaces.map((w) => ({
      id: w._id,
      name: w.name,
      kind: w.kind,
      defaultCurrency: w.defaultCurrency,
      role: memberships.find((m) => m.workspaceId.equals(w._id))?.role,
    })),
  };
}

authRouter.post("/register", authLimiter, async (req, res) => {
  const body = registerBody.parse(req.body);
  const anyUser = await User.exists({});
  if (anyUser && !config.allowSignup) throw new HttpError(403, "Sign-up is closed", "signup_closed");
  if (await User.exists({ email: body.email })) throw new HttpError(409, "Email already registered", "email_taken");

  const passwordHash = await bcrypt.hash(body.password, 12);
  const session = await mongoose.startSession().catch(() => null);
  let userId: string;
  const create = async () => {
    const [user] = await User.create([{ email: body.email, name: body.name, passwordHash }], { session });
    const [ws] = await Workspace.create([{ name: `${body.name}'s space`, kind: "personal", ownerId: user._id }], {
      session,
    });
    await Membership.create([{ workspaceId: ws._id, userId: user._id, role: "owner" }], { session });
    user.defaultWorkspaceId = ws._id;
    await user.save({ session });
    userId = user._id.toString();
  };
  // Transactions need a replica set (Atlas has one); fall back for standalone dev servers.
  try {
    if (session) await session.withTransaction(create);
    else await create();
  } catch (e) {
    if (session && String(e).includes("Transaction numbers are only allowed")) await create();
    else throw e;
  } finally {
    await session?.endSession();
  }

  res.status(201).json({ user: await publicUser(userId!), ...(await sessionFor(userId!, req.get("user-agent"))) });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const body = loginBody.parse(req.body);
  const user = await User.findOne({ email: body.email }).select("+passwordHash");
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized("Incorrect email or password");
  const userId = user._id.toString();
  res.json({ user: await publicUser(userId), ...(await sessionFor(userId, req.get("user-agent"))) });
});

authRouter.post("/refresh", authLimiter, async (req, res) => {
  const { refreshToken } = refreshBody.parse(req.body);
  const rotated = await rotateRefreshToken(refreshToken, req.get("user-agent"));
  res.json({ accessToken: rotated.accessToken, refreshToken: rotated.refreshToken });
});

authRouter.post("/logout", async (req, res) => {
  const parsed = refreshBody.safeParse(req.body);
  if (parsed.success) await revokeRefreshToken(parsed.data.refreshToken);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await publicUser(ctx(req).userId) });
});

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Unknown timezone");

const profileBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(30).regex(/^[+\d\s().-]*$/, "Use digits, spaces and + ( ) - only").nullish(),
  timezone: timezone.optional(),
  preferences: z
    .object({
      emailReminders: z.boolean().optional(),
      reminderEmail: z.string().trim().toLowerCase().email().max(200).nullish(),
      weeklyDigest: z.boolean().optional(),
    })
    .optional(),
  // Workspace-level settings the owner can change from their profile.
  workspace: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      defaultCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
    })
    .optional(),
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const body = profileBody.parse(req.body);
  const { userId, workspaceId, role } = ctx(req);
  const user = await User.findById(userId);
  if (!user) throw unauthorized();
  if (body.name !== undefined) user.name = body.name;
  if (body.phone !== undefined) user.set("phone", body.phone || undefined);
  if (body.timezone !== undefined) user.timezone = body.timezone;
  if (body.preferences?.emailReminders !== undefined) user.set("preferences.emailReminders", body.preferences.emailReminders);
  if (body.preferences?.weeklyDigest !== undefined) user.set("preferences.weeklyDigest", body.preferences.weeklyDigest);
  if (body.preferences?.reminderEmail !== undefined)
    user.set("preferences.reminderEmail", body.preferences.reminderEmail || undefined);
  await user.save();
  if (body.workspace && Object.keys(body.workspace).length) {
    if (role !== "owner") throw new HttpError(403, "Only the owner can change workspace settings", "forbidden");
    await Workspace.updateOne({ _id: workspaceId }, body.workspace);
  }
  res.json({ user: await publicUser(userId) });
});

const passwordBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });

/** Change password and sign out every other session; returns a fresh session for this device. */
authRouter.post("/change-password", authLimiter, requireAuth, async (req, res) => {
  const body = passwordBody.parse(req.body);
  const { userId } = ctx(req);
  const user = await User.findById(userId).select("+passwordHash");
  if (!user || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect", "bad_password");
  }
  user.passwordHash = await bcrypt.hash(body.newPassword, 12);
  user.passwordChangedAt = new Date();
  await user.save();
  await RefreshToken.updateMany({ userId, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  res.json(await sessionFor(userId.toString(), req.get("user-agent")));
});

authRouter.get("/status", async (_req, res) => {
  const hasUsers = Boolean(await User.exists({}));
  res.json({ signupOpen: !hasUsers || config.allowSignup });
});
