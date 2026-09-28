import { Types } from "mongoose";
import { z } from "zod";
import { CAPTURE_TYPES, DOCUMENT_KINDS, REIMBURSEMENT_STATUSES } from "../models/Capture.js";

export const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), "Invalid id");
export const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code");
/** Money is always integer minor units (cents) to avoid float rounding. */
export const amountMinor = z.number().int().min(0).max(1_000_000_000_00);
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).nullish();

export const reimbursementInput = z.object({
  organization: optText(200),
  status: z.enum(REIMBURSEMENT_STATUSES).optional(),
  submittedAt: z.coerce.date().nullish(),
  amountOwedMinor: amountMinor.nullish(),
  amountReimbursedMinor: amountMinor.nullish(),
  reimbursedAt: z.coerce.date().nullish(),
  notes: optText(2000),
});

export const captureInput = z.object({
  type: z.enum(CAPTURE_TYPES),
  filed: z.boolean(),
  visibility: z.enum(["workspace", "private"]),
  title: text(300).min(1),
  notes: optText(20000),
  tags: z.array(text(50).min(1)).max(30),
  category: optText(100),
  url: z.string().trim().url().max(2000).nullish(),
  source: z.enum(["manual", "upload", "camera", "share", "web", "import"]),
  counterparty: optText(200),
  amountMinor: amountMinor.nullish(),
  currency,
  occurredAt: z.coerce.date().nullish(),
  property: optText(200),
  trip: optText(200),
  organization: optText(200),
  paidBy: objectId.nullish(),
  returnBy: z.coerce.date().nullish(),
  warrantyUntil: z.coerce.date().nullish(),
  reminderDaysBefore: z.number().int().min(0).max(120).nullish(),
  document: z
    .object({
      kind: z.enum(DOCUMENT_KINDS).optional(),
      reference: optText(40),
      expiresAt: z.coerce.date().nullish(),
    })
    .nullish(),
  place: z
    .object({
      kind: z.enum(["restaurant", "stay", "sight", "shop", "other"]).optional(),
      address: optText(500),
      mapUrl: z.string().trim().url().max(2000).nullish(),
      visited: z.boolean().optional(),
      rating: z.number().int().min(1).max(5).nullish(),
    })
    .nullish(),
  idea: z
    .object({
      kind: z.enum(["product", "design", "gift", "other"]).optional(),
      status: z.enum(["want", "done", "dropped"]).optional(),
    })
    .nullish(),
  payment: z
    .object({
      method: optText(100),
      confirmationNumber: optText(200),
      dueDate: z.coerce.date().nullish(),
    })
    .nullish(),
  expense: z
    .object({
      project: optText(200),
      paymentMethod: optText(100),
      reimbursable: z.boolean().optional(),
      reimbursement: reimbursementInput.nullish(),
    })
    .nullish(),
  deposit: z
    .object({
      checkNumber: optText(50),
      bankAccount: optText(100),
      cleared: z.boolean().optional(),
      clearedAt: z.coerce.date().nullish(),
    })
    .nullish(),
  attachmentIds: z.array(objectId).max(50),
  links: z.array(z.object({ captureId: objectId, relation: text(50).default("related") })).max(50),
});

export const captureCreate = captureInput.partial().required({ title: true }).extend({
  type: z.enum(CAPTURE_TYPES).default("note"),
});
export const captureUpdate = captureInput.partial();

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["recent", "oldest", "amount", "created"]).default("recent"),
});

/** Drop nulls so Mongoose unsets those paths when used with doc.set(). */
export function nullsToUndefined<T>(value: T): T {
  if (value === null) return undefined as T;
  if (Array.isArray(value) || value instanceof Date || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, nullsToUndefined(v)]),
  ) as T;
}
