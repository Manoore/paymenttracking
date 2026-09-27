import type { Request } from "express";
import type { FilterQuery } from "mongoose";
import { z } from "zod";
import { scope } from "../middleware/auth.js";
import { CAPTURE_TYPES, REIMBURSEMENT_STATUSES, type CaptureDoc } from "../models/Capture.js";

const csvList = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)));

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

export const captureFilters = z.object({
  q: z.string().trim().max(200).optional(),
  type: csvList(CAPTURE_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  category: z.string().optional(),
  counterparty: z.string().optional(),
  property: z.string().optional(),
  trip: z.string().optional(),
  tag: z.string().optional(),
  filed: bool.optional(),
  reimbursable: bool.optional(),
  reimbursementStatus: csvList(REIMBURSEMENT_STATUSES).optional(),
  organization: z.string().optional(),
  cleared: bool.optional(),
  hasAttachments: bool.optional(),
});
export type CaptureFilters = z.infer<typeof captureFilters>;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactCi = (s: string) => new RegExp(`^${escapeRegex(s)}$`, "i");

/**
 * Builds the Mongo filter shared by list, export and reports so they always agree.
 * Search is case-insensitive substring matching: predictable at personal-data
 * volumes. Upgrade path: Atlas Search / vector search behind the same `q` param.
 */
export function buildCaptureFilter(req: Request, f: CaptureFilters): FilterQuery<CaptureDoc> {
  const and: FilterQuery<CaptureDoc>[] = [scope(req)];

  if (f.q) {
    const words = f.q.split(/\s+/).filter(Boolean).slice(0, 8);
    for (const word of words) {
      const rx = new RegExp(escapeRegex(word), "i");
      and.push({
        $or: [
          { title: rx },
          { notes: rx },
          { counterparty: rx },
          { property: rx },
          { trip: rx },
          { category: rx },
          { tags: rx },
          { url: rx },
          { "payment.confirmationNumber": rx },
          { "expense.reimbursement.organization": rx },
          { "deposit.checkNumber": rx },
          { extractedText: rx },
        ],
      });
    }
  }
  if (f.type?.length) and.push({ type: { $in: f.type } });
  if (f.from || f.to) {
    const range: Record<string, Date> = {};
    if (f.from) range.$gte = f.from;
    if (f.to) range.$lte = f.to;
    and.push({ $or: [{ occurredAt: range }, { occurredAt: { $exists: false }, createdAt: range }] });
  }
  if (f.category) and.push({ category: exactCi(f.category) });
  if (f.counterparty) and.push({ counterparty: exactCi(f.counterparty) });
  if (f.property) and.push({ property: exactCi(f.property) });
  if (f.trip) and.push({ trip: exactCi(f.trip) });
  if (f.tag) and.push({ tags: exactCi(f.tag) });
  if (f.filed !== undefined) and.push({ filed: f.filed });
  if (f.reimbursable !== undefined) and.push({ "expense.reimbursable": f.reimbursable ? true : { $ne: true } });
  if (f.reimbursementStatus?.length)
    and.push({ "expense.reimbursable": true, "expense.reimbursement.status": { $in: f.reimbursementStatus } });
  if (f.organization) and.push({ "expense.reimbursement.organization": exactCi(f.organization) });
  if (f.cleared !== undefined) and.push({ type: "deposit", "deposit.cleared": f.cleared ? true : { $ne: true } });
  if (f.hasAttachments !== undefined)
    and.push(f.hasAttachments ? { "attachmentIds.0": { $exists: true } } : { "attachmentIds.0": { $exists: false } });

  return { $and: and };
}
