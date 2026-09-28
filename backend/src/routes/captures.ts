import { Router, type Request } from "express";
import type { HydratedDocument, Types } from "mongoose";
import { buildCaptureFilter, captureFilters } from "../lib/captureQuery.js";
import { badRequest, notFound } from "../lib/errors.js";
import { captureCreate, captureUpdate, objectId, pagination } from "../lib/validation.js";
import { ctx, requireWrite, scope } from "../middleware/auth.js";
import { Attachment } from "../models/Attachment.js";
import { Capture, type CaptureDoc } from "../models/Capture.js";
import { Membership, Workspace } from "../models/identity.js";
import { storageFor } from "../storage/index.js";
import { withUrl } from "./attachments.js";

export const capturesRouter = Router();

const SORTS = {
  recent: { occurredAt: -1, createdAt: -1 },
  oldest: { occurredAt: 1, createdAt: 1 },
  amount: { amountMinor: -1, createdAt: -1 },
  created: { createdAt: -1 },
} as const;

const SUBDOCS = ["payment", "expense", "deposit", "document", "place", "idea"] as const;

/** Flatten nested sub-document patches to dotted paths so PATCH merges instead of replacing. */
function toPathUpdates(body: Record<string, unknown>) {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  const walk = (prefix: string, value: unknown, deep: boolean) => {
    if (value === null) return void unset.push(prefix);
    if (deep && value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      for (const [k, v] of Object.entries(value)) walk(`${prefix}.${k}`, v, k === "reimbursement");
      return;
    }
    if (value !== undefined) set[prefix] = value;
  };
  for (const [k, v] of Object.entries(body)) walk(k, v, (SUBDOCS as readonly string[]).includes(k));
  return { set, unset };
}

async function assertAttachmentsOwned(req: Request, ids: string[] | undefined) {
  if (!ids?.length) return;
  const count = await Attachment.countDocuments({ _id: { $in: ids }, workspaceId: ctx(req).workspaceId, deletedAt: { $exists: false } });
  if (count !== new Set(ids).size) throw badRequest("One or more attachments not found");
}

/** "Paid by" must be someone in this workspace. */
async function assertMember(req: Request, userId: string | null | undefined) {
  if (!userId) return;
  const ok = await Membership.exists({ workspaceId: ctx(req).workspaceId, userId });
  if (!ok) throw badRequest("Paid by must be a member of this workspace");
}

async function assertLinksOwned(req: Request, links: { captureId: string }[] | undefined) {
  if (!links?.length) return;
  const ids = [...new Set(links.map((l) => l.captureId))];
  const count = await Capture.countDocuments({ $and: [scope(req), { _id: { $in: ids } }] });
  if (count !== ids.length) throw badRequest("One or more linked records not found");
}

function normaliseDerived(doc: HydratedDocument<CaptureDoc>) {
  // One organization field for every type. Older records kept it only on the
  // reimbursement; adopt it, and keep the reimbursement copy in sync.
  const reimbursementOrg = doc.expense?.reimbursement?.organization;
  if (!doc.organization && reimbursementOrg) doc.organization = reimbursementOrg;
  if (doc.expense?.reimbursement) doc.set("expense.reimbursement.organization", doc.organization || undefined);
  // Keep type-specific sub-documents consistent with the type.
  if (doc.expense?.reimbursable && !doc.expense.reimbursement) doc.set("expense.reimbursement", { status: "to_submit" });
  if (doc.deposit?.cleared && !doc.deposit.clearedAt) doc.set("deposit.clearedAt", new Date());
  if (doc.deposit && doc.deposit.cleared === false) doc.set("deposit.clearedAt", undefined);
  if (doc.tags?.length) doc.tags = [...new Set(doc.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

async function linkAttachments(captureId: Types.ObjectId, ids: unknown[] | undefined) {
  if (ids?.length) await Attachment.updateMany({ _id: { $in: ids } }, { captureId });
}

function editDistance(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Closest known name (payee, property, org, category, tag) to a misspelled query, e.g. "costko" → "Costco". */
async function suggestSpelling(req: Request, q: string) {
  const fields = ["counterparty", "property", "organization", "category", "trip", "tags"];
  const values = (await Promise.all(fields.map((f) => Capture.distinct(f, scope(req))))).flat();
  const query = q.toLowerCase();
  let best: { v: string; d: number } | undefined;
  for (const v of values) {
    if (typeof v !== "string" || !v) continue;
    // Compare against the whole value and each word ("oak grve" vs "Oak Grove HOA").
    const candidates = [v.toLowerCase(), ...v.toLowerCase().split(/s+/)];
    for (const c of candidates) {
      const d = editDistance(query, c.slice(0, query.length + 2));
      const limit = query.length <= 4 ? 1 : 2;
      if (d <= limit && (!best || d < best.d)) best = { v, d };
    }
  }
  return best?.v;
}

export async function loadCapture(req: Request, id: string) {
  if (!objectId.safeParse(id).success) throw notFound("Record");
  const doc = await Capture.findOne({ $and: [scope(req), { _id: id }] });
  if (!doc) throw notFound("Record");
  return doc;
}

capturesRouter.get("/", async (req, res) => {
  const filters = captureFilters.parse(req.query);
  const { page, limit, sort } = pagination.parse(req.query);
  const filter = buildCaptureFilter(req, filters);
  const [items, total] = await Promise.all([
    Capture.find(filter).sort(SORTS[sort]).skip((page - 1) * limit).limit(limit).lean(),
    Capture.countDocuments(filter),
  ]);
  let didYouMean: string | undefined;
  if (!total && filters.q && filters.q.length >= 3) didYouMean = await suggestSpelling(req, filters.q);
  res.json({ items, total, page, limit, didYouMean });
});

/**
 * Quick templates: the combinations you record most (e.g. "HOA payment to Oak
 * Grove HOA, property Oak Grove"), so repeat entries are one tap.
 */
capturesRouter.get("/templates", async (req, res) => {
  const rows = await Capture.aggregate([
    { $match: { $and: [scope(req), { type: { $in: ["payment", "expense", "deposit"] }, counterparty: { $nin: [null, ""] } }] } },
    { $sort: { occurredAt: -1, createdAt: -1 } },
    { $limit: 500 },
    {
      $group: {
        _id: {
          type: "$type",
          counterparty: { $toLower: "$counterparty" },
          organization: { $toLower: { $ifNull: ["$organization", ""] } },
          property: { $toLower: { $ifNull: ["$property", ""] } },
        },
        count: { $sum: 1 },
        last: { $first: "$$ROOT" },
      },
    },
    { $sort: { count: -1, "last.occurredAt": -1 } },
    { $limit: 8 },
  ]);
  res.json({
    items: rows.map(({ count, last }) => ({
      count,
      label: `${last.type === "deposit" ? "From" : last.type === "expense" ? "At" : "To"} ${last.counterparty}`,
      values: {
        type: last.type,
        title: last.title,
        counterparty: last.counterparty,
        amountMinor: last.amountMinor,
        currency: last.currency,
        category: last.category,
        property: last.property,
        trip: last.trip,
        organization: last.organization,
        method: last.payment?.method ?? last.expense?.paymentMethod,
        reimbursable: last.expense?.reimbursable ?? false,
      },
    })),
  });
});

/** Recently deleted records (soft-deleted), newest first. */
capturesRouter.get("/trash", async (req, res) => {
  const { workspaceId, userId } = ctx(req);
  const items = await Capture.find({
    workspaceId,
    deletedAt: { $exists: true },
    $or: [{ visibility: "workspace" }, { createdBy: userId }],
  })
    .sort({ deletedAt: -1 })
    .limit(200)
    .lean();
  res.json({ items });
});

capturesRouter.post("/", requireWrite, async (req, res) => {
  const body = captureCreate.parse(req.body);
  const { workspaceId, userId } = ctx(req);
  await assertAttachmentsOwned(req, body.attachmentIds);
  await assertLinksOwned(req, body.links);
  await assertMember(req, body.paidBy);
  const ws = await Workspace.findById(workspaceId).lean();

  const doc = new Capture({
    currency: ws?.defaultCurrency ?? "USD",
    filed: body.type !== "note",
    // Money you record is assumed paid by you unless you pick another member.
    ...(["payment", "expense"].includes(body.type) ? { paidBy: userId } : {}),
    ...(["payment", "expense", "deposit"].includes(body.type) ? { occurredAt: new Date() } : {}),
    ...body,
    workspaceId,
    createdBy: userId,
  });
  for (const k of Object.keys(body) as (keyof typeof body)[]) if (body[k] === null) doc.set(k, undefined);
  normaliseDerived(doc);
  await doc.save();
  await linkAttachments(doc._id, body.attachmentIds);
  res.status(201).json(doc.toObject());
});

capturesRouter.get("/:id", async (req, res) => {
  const doc = await loadCapture(req, String(req.params.id));
  const [attachments, linked, backlinks] = await Promise.all([
    Attachment.find({ _id: { $in: doc.attachmentIds }, deletedAt: { $exists: false } }).lean(),
    Capture.find({ $and: [scope(req), { _id: { $in: doc.links.map((l) => l.captureId) } }] })
      .select("title type amountMinor currency occurredAt counterparty")
      .lean(),
    Capture.find({ $and: [scope(req), { "links.captureId": doc._id }] })
      .select("title type amountMinor currency occurredAt counterparty links")
      .lean(),
  ]);
  res.json({ ...doc.toObject(), attachments: attachments.map(withUrl), linked, backlinks });
});

capturesRouter.patch("/:id", requireWrite, async (req, res) => {
  const body = captureUpdate.parse(req.body);
  const doc = await loadCapture(req, String(req.params.id));
  await assertAttachmentsOwned(req, body.attachmentIds);
  await assertLinksOwned(req, body.links);
  await assertMember(req, body.paidBy);
  if (body.links?.some((l) => l.captureId === doc.id)) throw badRequest("A record cannot link to itself");

  const { set, unset } = toPathUpdates(body as Record<string, unknown>);
  for (const path of unset) doc.set(path, undefined);
  for (const [path, value] of Object.entries(set)) doc.set(path, value);
  if (body.type && body.type !== "note" && body.filed === undefined) doc.filed = true;
  normaliseDerived(doc);
  await doc.save();
  await linkAttachments(doc._id, body.attachmentIds);
  res.json(doc.toObject());
});

capturesRouter.delete("/:id", requireWrite, async (req, res) => {
  const doc = await loadCapture(req, String(req.params.id));
  doc.deletedAt = new Date();
  await doc.save();
  res.status(204).end();
});

capturesRouter.delete("/:id/permanent", requireWrite, async (req, res) => {
  const { workspaceId, userId } = ctx(req);
  const doc = await Capture.findOne({
    _id: String(req.params.id),
    workspaceId,
    deletedAt: { $exists: true },
    $or: [{ visibility: "workspace" }, { createdBy: userId }],
  });
  if (!doc) throw notFound("Deleted record");
  const atts = await Attachment.find({ captureId: doc._id });
  for (const a of atts) {
    await storageFor(a.storage!.driver).remove(a.storage!.key).catch(() => undefined);
  }
  await Attachment.deleteMany({ captureId: doc._id });
  await doc.deleteOne();
  res.status(204).end();
});

capturesRouter.post("/:id/restore", requireWrite, async (req, res) => {
  const { workspaceId, userId } = ctx(req);
  const doc = await Capture.findOneAndUpdate(
    {
      _id: String(req.params.id),
      workspaceId,
      deletedAt: { $exists: true },
      $or: [{ visibility: "workspace" }, { createdBy: userId }],
    },
    { $unset: { deletedAt: 1 } },
    { new: true },
  );
  if (!doc) throw notFound("Deleted record");
  res.json(doc.toObject());
});
