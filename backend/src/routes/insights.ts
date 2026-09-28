import { Router } from "express";
import { z } from "zod";
import { buildCaptureFilter, captureFilters } from "../lib/captureQuery.js";
import { formatMinor, toCsv } from "../lib/csv.js";
import { notFound } from "../lib/errors.js";
import { addDays, startOfUtcDay } from "../lib/recurrence.js";
import { ctx, scope } from "../middleware/auth.js";
import { Capture } from "../models/Capture.js";
import { Notification, RecurringSchedule } from "../models/RecurringSchedule.js";

export const insightsRouter = Router();

// Organization lives at the top level; older reimbursable records only have it on the reimbursement.
const ORG = { $ifNull: ["$organization", "$expense.reimbursement.organization"] };

/**
 * Group text values case- and space-insensitively ("India Club" == "india club ")
 * while displaying the first spelling seen.
 */
// Amount you're owed back: the split amount if set, otherwise the whole expense.
const OWED = { $ifNull: ["$expense.reimbursement.amountOwedMinor", { $ifNull: ["$amountMinor", 0] }] };

const ciKey = (expr: unknown) => ({ $toLower: { $trim: { input: { $ifNull: [expr, ""] } } } });
const label = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);

insightsRouter.get("/dashboard", async (req, res) => {
  const { workspaceId, userId } = ctx(req);
  const today = startOfUtcDay();
  const horizon = addDays(today, Number(req.query.days ?? 14));
  const base = scope(req);

  const [overdue, upcoming, recent, inboxCount, owed, uncleared, unread, expiring, setup] = await Promise.all([
    RecurringSchedule.find({ workspaceId, active: true, nextDueDate: { $lt: today } }).sort({ nextDueDate: 1 }).lean(),
    RecurringSchedule.find({ workspaceId, active: true, nextDueDate: { $gte: today, $lte: horizon } })
      .sort({ nextDueDate: 1 })
      .lean(),
    Capture.find(base).sort({ createdAt: -1 }).limit(8).lean(),
    Capture.countDocuments({ $and: [base, { filed: false }] }),
    Capture.aggregate([
      { $match: { $and: [base, { "expense.reimbursable": true, "expense.reimbursement.status": { $ne: "reimbursed" } }] } },
      {
        $group: {
          _id: { key: ciKey(ORG), currency: "$currency" },
          organization: { $first: ORG },
          count: { $sum: 1 },
          outstandingMinor: {
            $sum: { $subtract: [OWED, { $ifNull: ["$expense.reimbursement.amountReimbursedMinor", 0] }] },
          },
        },
      },
      { $sort: { outstandingMinor: -1 } },
    ]),
    Capture.find({ $and: [base, { type: "deposit", "deposit.cleared": { $ne: true } }] }).sort({ occurredAt: -1 }).limit(10).lean(),
    Notification.countDocuments({ userId, workspaceId, readAt: { $exists: false } }),
    // Papers expiring, return windows closing, warranties ending.
    Capture.find({
      $and: [
        base,
        {
          $or: [
            { "document.expiresAt": { $gte: addDays(today, -30), $lte: addDays(today, 60) } },
            { returnBy: { $gte: addDays(today, -3), $lte: addDays(today, 14) } },
            { warrantyUntil: { $gte: addDays(today, -7), $lte: addDays(today, 30) } },
          ],
        },
      ],
    })
      .limit(20)
      .lean(),
    Promise.all([
      Capture.countDocuments(base),
      RecurringSchedule.countDocuments({ workspaceId }),
      Capture.countDocuments({ $and: [base, { "attachmentIds.0": { $exists: true } }] }),
    ]),
  ]);

  const expiringItems = expiring
    .flatMap((c) => [
      c.document?.expiresAt && { kind: "expires", date: c.document.expiresAt, capture: c },
      c.returnBy && { kind: "return", date: c.returnBy, capture: c },
      c.warrantyUntil && { kind: "warranty", date: c.warrantyUntil, capture: c },
    ])
    .filter((x): x is { kind: string; date: Date; capture: (typeof expiring)[number] } => Boolean(x))
    .filter((x) => x.date >= addDays(today, -30) && x.date <= addDays(today, 60))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((x) => ({ kind: x.kind, date: x.date, id: x.capture._id, title: x.capture.title, type: x.capture.type }));

  res.json({
    overdue,
    upcoming,
    recent,
    inboxCount,
    reimbursementsOwed: owed.map((g) => ({ organization: label(g.organization, "Unassigned"), currency: g._id.currency, count: g.count, outstandingMinor: g.outstandingMinor })),
    unclearedDeposits: uncleared,
    unreadNotifications: unread,
    expiring: expiringItems,
    setup: { captures: setup[0], schedules: setup[1], withProof: setup[2] },
  });
});

const groupFields = {
  organization: ORG,
  trip: "$trip",
} as const;

insightsRouter.get("/reimbursements", async (req, res) => {
  const groupBy = z.enum(["organization", "trip"]).default("organization").parse(req.query.groupBy);
  const includeDone = req.query.includeDone === "true";
  const match = {
    $and: [
      scope(req),
      { "expense.reimbursable": true },
      ...(includeDone ? [] : [{ "expense.reimbursement.status": { $ne: "reimbursed" } }]),
    ],
  };
  const groups = await Capture.aggregate([
    { $match: match },
    { $sort: { occurredAt: -1 } },
    {
      $group: {
        _id: { key: ciKey(groupFields[groupBy]), currency: "$currency" },
        label: { $first: groupFields[groupBy] },
        totalMinor: { $sum: OWED },
        reimbursedMinor: { $sum: { $ifNull: ["$expense.reimbursement.amountReimbursedMinor", 0] } },
        items: {
          $push: {
            _id: "$_id",
            title: "$title",
            counterparty: "$counterparty",
            amountMinor: "$amountMinor",
            owedMinor: OWED,
            occurredAt: "$occurredAt",
            trip: "$trip",
            organization: ORG,
            reimbursement: "$expense.reimbursement",
            attachmentCount: { $size: { $ifNull: ["$attachmentIds", []] } },
          },
        },
      },
    },
    { $sort: { "_id.key": 1 } },
  ]);
  res.json({
    groupBy,
    groups: groups.map((g) => ({
      key: label(g.label, "Unassigned"),
      currency: g._id.currency,
      totalMinor: g.totalMinor,
      reimbursedMinor: g.reimbursedMinor,
      outstandingMinor: g.totalMinor - g.reimbursedMinor,
      items: g.items,
    })),
  });
});

const summaryGroups = {
  category: "$category",
  property: "$property",
  trip: "$trip",
  counterparty: "$counterparty",
  organization: ORG,
  type: "$type",
  month: { $dateToString: { format: "%Y-%m", date: { $ifNull: ["$occurredAt", "$createdAt"] } } },
} as const;

insightsRouter.get("/reports/summary", async (req, res) => {
  const groupBy = z.enum(Object.keys(summaryGroups) as [keyof typeof summaryGroups]).default("category").parse(req.query.groupBy);
  const filter = buildCaptureFilter(req, captureFilters.parse(req.query));
  const rows = await Capture.aggregate([
    { $match: { $and: [filter, { amountMinor: { $ne: null } }] } },
    {
      $group: {
        _id: { key: ciKey(summaryGroups[groupBy]), currency: "$currency", type: "$type" },
        label: { $first: summaryGroups[groupBy] },
        totalMinor: { $sum: "$amountMinor" },
        count: { $sum: 1 },
      },
    },
    { $sort: { totalMinor: -1 } },
  ]);
  res.json({
    groupBy,
    rows: rows.map((r) => ({ key: label(r.label, "(none)"), groupKey: r._id.key as string, currency: r._id.currency, type: r._id.type, totalMinor: r.totalMinor, count: r.count })),
  });
});

insightsRouter.get("/reports/export.csv", async (req, res) => {
  const filter = buildCaptureFilter(req, captureFilters.parse(req.query));
  const items = await Capture.find(filter).sort({ occurredAt: -1, createdAt: -1 }).limit(10_000).lean();
  const csv = toCsv(
    [
      "Date", "Type", "Title", "Counterparty", "Amount", "Currency", "Category", "Property", "Trip", "Organization", "Tags",
      "Method", "Confirmation #", "Reimbursable", "Reimbursement status", "Reimbursed amount",
      "Check #", "Cleared", "Attachments", "Notes", "Id",
    ],
    items.map((c) => [
      c.occurredAt ?? c.createdAt,
      c.type,
      c.title,
      c.counterparty,
      formatMinor(c.amountMinor),
      c.currency,
      c.category,
      c.property,
      c.trip,
      c.organization ?? c.expense?.reimbursement?.organization,
      (c.tags ?? []).join("; "),
      c.payment?.method ?? c.expense?.paymentMethod,
      c.payment?.confirmationNumber,
      c.expense?.reimbursable ? "yes" : "",
      c.expense?.reimbursement?.status,
      formatMinor(c.expense?.reimbursement?.amountReimbursedMinor),
      c.deposit?.checkNumber,
      c.type === "deposit" ? (c.deposit?.cleared ? "yes" : "no") : "",
      c.attachmentIds?.length ?? 0,
      c.notes,
      c._id,
    ]),
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="capture-hub-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + csv);
});

const SUGGEST_FIELDS = {
  counterparty: "counterparty",
  property: "property",
  trip: "trip",
  category: "category",
  tags: "tags",
  organization: "organization",
  method: "payment.method",
} as const;

insightsRouter.get("/suggestions", async (req, res) => {
  const field = z.enum(Object.keys(SUGGEST_FIELDS) as [keyof typeof SUGGEST_FIELDS]).parse(req.query.field);
  const paths = field === "organization" ? ["organization", "expense.reimbursement.organization"] : [SUGGEST_FIELDS[field]];
  const values = (await Promise.all(paths.map((p) => Capture.distinct(p, scope(req))))).flat() as unknown[];
  // One suggestion per name regardless of case, so "India Club" isn't offered next to "india club".
  const byKey = new Map<string, string>();
  for (const v of values) {
    if (typeof v !== "string" || !v.trim()) continue;
    const key = v.trim().toLowerCase();
    if (!byKey.has(key)) byKey.set(key, v.trim());
  }
  const cleaned = [...byKey.values()].sort((a, b) => a.localeCompare(b));
  res.json({ field, values: cleaned.slice(0, 500) });
});

insightsRouter.get("/notifications", async (req, res) => {
  const { userId, workspaceId } = ctx(req);
  const items = await Notification.find({ userId, workspaceId }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ items });
});

insightsRouter.post("/notifications/:id/read", async (req, res) => {
  const { userId } = ctx(req);
  const r = await Notification.updateOne({ _id: String(req.params.id), userId }, { readAt: new Date() });
  if (!r.matchedCount) throw notFound("Notification");
  res.status(204).end();
});

/** Every property you've recorded, with totals, for the Properties page. */
insightsRouter.get("/properties", async (req, res) => {
  const { workspaceId } = ctx(req);
  const [rows, schedules] = await Promise.all([
    Capture.aggregate([
      { $match: { $and: [scope(req), { property: { $nin: [null, ""] } }] } },
      {
        $group: {
          _id: { key: ciKey("$property"), currency: "$currency" },
          name: { $first: "$property" },
          count: { $sum: 1 },
          totalMinor: { $sum: { $cond: [{ $in: ["$type", ["payment", "expense"]] }, { $ifNull: ["$amountMinor", 0] }, 0] } },
          lastAt: { $max: { $ifNull: ["$occurredAt", "$createdAt"] } },
        },
      },
      { $sort: { lastAt: -1 } },
    ]),
    RecurringSchedule.find({ workspaceId, active: true, property: { $nin: [null, ""] } }).lean(),
  ]);
  const byKey = new Map<string, { name: string; count: number; lastAt: Date; totals: { currency: string; totalMinor: number }[]; schedules: number }>();
  for (const r of rows) {
    const cur = byKey.get(r._id.key) ?? { name: label(r.name, "(none)"), count: 0, lastAt: r.lastAt as Date, totals: [] as { currency: string; totalMinor: number }[], schedules: 0 };
    cur.count += r.count;
    cur.totals.push({ currency: r._id.currency, totalMinor: r.totalMinor });
    if (r.lastAt > cur.lastAt) cur.lastAt = r.lastAt;
    byKey.set(r._id.key, cur);
  }
  for (const s of schedules) {
    const key = s.property!.trim().toLowerCase();
    const cur = byKey.get(key) ?? { name: s.property!, count: 0, lastAt: s.createdAt as Date, totals: [] as { currency: string; totalMinor: number }[], schedules: 0 };
    cur.schedules++;
    byKey.set(key, cur);
  }
  res.json({ items: [...byKey.values()] });
});
