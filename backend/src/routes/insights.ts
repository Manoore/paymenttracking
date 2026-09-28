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
const ciKey = (expr: unknown) => ({ $toLower: { $trim: { input: { $ifNull: [expr, ""] } } } });
const label = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);

insightsRouter.get("/dashboard", async (req, res) => {
  const { workspaceId, userId } = ctx(req);
  const today = startOfUtcDay();
  const horizon = addDays(today, Number(req.query.days ?? 14));
  const base = scope(req);

  const [overdue, upcoming, recent, inboxCount, owed, uncleared, unread] = await Promise.all([
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
            $sum: { $subtract: [{ $ifNull: ["$amountMinor", 0] }, { $ifNull: ["$expense.reimbursement.amountReimbursedMinor", 0] }] },
          },
        },
      },
      { $sort: { outstandingMinor: -1 } },
    ]),
    Capture.find({ $and: [base, { type: "deposit", "deposit.cleared": { $ne: true } }] }).sort({ occurredAt: -1 }).limit(10).lean(),
    Notification.countDocuments({ userId, workspaceId, readAt: { $exists: false } }),
  ]);

  res.json({
    overdue,
    upcoming,
    recent,
    inboxCount,
    reimbursementsOwed: owed.map((g) => ({ organization: label(g.organization, "Unassigned"), currency: g._id.currency, count: g.count, outstandingMinor: g.outstandingMinor })),
    unclearedDeposits: uncleared,
    unreadNotifications: unread,
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
        totalMinor: { $sum: { $ifNull: ["$amountMinor", 0] } },
        reimbursedMinor: { $sum: { $ifNull: ["$expense.reimbursement.amountReimbursedMinor", 0] } },
        items: {
          $push: {
            _id: "$_id",
            title: "$title",
            counterparty: "$counterparty",
            amountMinor: "$amountMinor",
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
