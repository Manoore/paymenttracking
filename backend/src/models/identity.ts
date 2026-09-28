import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    defaultWorkspaceId: { type: Schema.Types.ObjectId, ref: "Workspace" },
    phone: { type: String, trim: true },
    timezone: String, // IANA zone; unset until the user saves their profile (clients default to device zone)
    preferences: {
      emailReminders: { type: Boolean, default: true },
      // Optional separate address for reminders (e.g. a shared household inbox).
      reminderEmail: { type: String, trim: true, lowercase: true },
      weeklyDigest: { type: Boolean, default: true },
    },
    lastDigestAt: Date,
    // Browser push subscriptions, one per device that enabled notifications.
    pushSubscriptions: {
      type: [
        {
          endpoint: { type: String, required: true },
          p256dh: { type: String, required: true },
          auth: { type: String, required: true },
          userAgent: String,
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: undefined,
      select: false,
    },
    passwordChangedAt: Date,
    // Secret for the read-only calendar feed URL; regenerate to revoke.
    calendarToken: { type: String, index: { unique: true, sparse: true }, select: false },
  },
  { timestamps: true },
);
export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const User = model("User", userSchema);

/**
 * A workspace owns every record. MVP creates one "personal" workspace per user;
 * a "family" workspace can later add members without touching record schemas.
 */
const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["personal", "family"], default: "personal" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    defaultCurrency: { type: String, default: "USD" },
  },
  { timestamps: true },
);
export const Workspace = model("Workspace", workspaceSchema);

export const ROLES = ["owner", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

const membershipSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true },
);
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1 });
export const Membership = model("Membership", membershipSchema);

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    userAgent: { type: String },
  },
  { timestamps: true },
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshToken = model("RefreshToken", refreshTokenSchema);
