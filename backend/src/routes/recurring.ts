import { Router, type Request } from "express";
import { z } from "zod";
import { badRequest, HttpError, notFound } from "../lib/errors.js";
import { nextDueDate } from "../lib/recurrence.js";
import { amountMinor, currency, nullsToUndefined, objectId } from "../lib/validation.js";
import { ctx, requireWrite, scope } from "../middleware/auth.js";
import { Attachment } from "../models/Attachment.js";
import { Capture } from "../models/Capture.js";
import { RecurringSchedule } from "../models/RecurringSchedule.js";
import { Membership, User } from "../models/identity.js";

export const recurringRouter = Router();

const scheduleInput = z.object({
  title: z.string().trim().min(1).max(200),
  counterparty: z.string().trim().max(200).nullish(),
  amountMinor: amountMinor.nullish(),
  currency: currency.optional(),
  category: z.string().trim().max(100).nullish(),
  property: z.string().trim().max(200).nullish(),
  method: z.string().trim().max(100).nullish(),
  notes: z.string().trim().max(5000).nullish(),
  frequency: z.object({ unit: z.enum(["week", "month", "year"]), interval: z.number().int().min(1).max(24).default(1) }),
  nextDueDate: z.coerce.date(),
  reminderDaysBefore: z.number().int().min(0).max(60).optional(),
  active: z.boolean().optional(),
});

const payInput = z.object({
  paidAt: z.coerce.date().default(() => new Date()),
  amountMinor: amountMinor.optional(),
  method: z.string().trim().max(100).optional(),
  confirmationNumber: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(5000).optional(),
  attachmentIds: z.array(objectId).max(20).default([]),
  paidBy: objectId.optional(),
});

function wsFilter(req: Request) {
  return { workspaceId: ctx(req).workspaceId };
}

async function loadSchedule(req: Request, id: string) {
  if (!objectId.safeParse(id).success) throw notFound("Schedule");
  const s = await RecurringSchedule.findOne({ _id: id, ...wsFilter(req) });
  if (!s) throw notFound("Schedule");
  return s;
}

recurringRouter.get("/", async (req, res) => {
  const active = req.query.active === "false" ? false : req.query.active === "all" ? undefined : true;
  const items = await RecurringSchedule.find({ ...wsFilter(req), ...(active === undefined ? {} : { active }) })
    .sort({ nextDueDate: 1 })
    .lean();
  res.json({ items });
});

recurringRouter.post("/", requireWrite, async (req, res) => {
  const body = nullsToUndefined(scheduleInput.parse(req.body));
  const { workspaceId, userId } = ctx(req);
  const s = await RecurringSchedule.create({
    ...body,
    anchorDay: body.nextDueDate.getUTCDate(),
    workspaceId,
    createdBy: userId,
  });
  res.status(201).json(s.toObject());
});

recurringRouter.get("/:id", async (req, res) => {
  const s = await loadSchedule(req, String(req.params.id));
  const history = await Capture.find({ $and: [scope(req), { "payment.scheduleId": s._id }] })
    .sort({ occurredAt: -1 })
    .limit(100)
    .lean();
  res.json({ ...s.toObject(), history });
});

recurringRouter.patch("/:id", requireWrite, async (req, res) => {
  const body = scheduleInput.partial().parse(req.body);
  const s = await loadSchedule(req, String(req.params.id));
  for (const [k, v] of Object.entries(body)) s.set(k, v === null ? undefined : v);
  if (body.nextDueDate) s.anchorDay = body.nextDueDate.getUTCDate();
  await s.save();
  res.json(s.toObject());
});

recurringRouter.delete("/:id", requireWrite, async (req, res) => {
  // Deactivate rather than delete so payment history keeps its link.
  const s = await loadSchedule(req, String(req.params.id));
  s.active = false;
  await s.save();
  res.status(204).end();
});

/**
 * Mark the current occurrence paid: creates a payment record with proof,
 * linked to this schedule, then advances the schedule to its next due date.
 */
recurringRouter.post("/:id/pay", requireWrite, async (req, res) => {
  const body = payInput.parse(req.body);
  const s = await loadSchedule(req, String(req.params.id));
  if (!s.active) throw badRequest("Schedule is inactive");
  const { workspaceId, userId } = ctx(req);

  if (body.attachmentIds.length) {
    const n = await Attachment.countDocuments({ _id: { $in: body.attachmentIds }, workspaceId });
    if (n !== new Set(body.attachmentIds).size) throw badRequest("One or more attachments not found");
  }

  const paidBy = body.paidBy ?? userId.toString();
  if (!(await Membership.exists({ workspaceId, userId: paidBy }))) throw badRequest("Paid by must be a member of this workspace");
  const dueDate = s.nextDueDate;
  const payment = await Capture.create({
    workspaceId,
    createdBy: userId,
    type: "payment",
    filed: true,
    source: "manual",
    title: s.title,
    counterparty: s.counterparty,
    amountMinor: body.amountMinor ?? s.amountMinor,
    currency: s.currency,
    category: s.category,
    property: s.property,
    occurredAt: body.paidAt,
    notes: body.notes,
    paidBy,
    payment: {
      method: body.method ?? s.method,
      confirmationNumber: body.confirmationNumber,
      scheduleId: s._id,
      dueDate,
    },
    attachmentIds: body.attachmentIds,
  });
  if (body.attachmentIds.length) await Attachment.updateMany({ _id: { $in: body.attachmentIds } }, { captureId: payment._id });

  s.lastPaidAt = body.paidAt;
  s.set("lastPaidBy", paidBy);
  s.lastPaymentId = payment._id;
  s.set("claimedBy", undefined);
  s.set("claimedAt", undefined);
  s.nextDueDate = nextDueDate(dueDate, s.frequency as { unit: "week" | "month" | "year"; interval: number }, s.anchorDay ?? undefined);
  await s.save();
  res.status(201).json({ payment: payment.toObject(), schedule: s.toObject() });
});

/** "I'm paying this": visible to everyone in the workspace until paid or released. */
recurringRouter.post("/:id/claim", requireWrite, async (req, res) => {
  const s = await loadSchedule(req, String(req.params.id));
  const { userId } = ctx(req);
  if (s.claimedBy && !s.claimedBy.equals(userId)) {
    const who = await User.findById(s.claimedBy).lean();
    throw new HttpError(409, `${who?.name ?? "Someone"} is already paying this`, "already_claimed");
  }
  s.claimedBy = userId;
  s.claimedAt = new Date();
  await s.save();
  res.json(s.toObject());
});

recurringRouter.delete("/:id/claim", requireWrite, async (req, res) => {
  const s = await loadSchedule(req, String(req.params.id));
  s.set("claimedBy", undefined);
  s.set("claimedAt", undefined);
  await s.save();
  res.json(s.toObject());
});

recurringRouter.post("/:id/skip", requireWrite, async (req, res) => {
  const s = await loadSchedule(req, String(req.params.id));
  s.nextDueDate = nextDueDate(s.nextDueDate, s.frequency as { unit: "week" | "month" | "year"; interval: number }, s.anchorDay ?? undefined);
  await s.save();
  res.json(s.toObject());
});
