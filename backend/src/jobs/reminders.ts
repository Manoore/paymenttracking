import { formatMinor } from "../lib/csv.js";
import { notifyUser } from "../lib/notify.js";
import { addDays, startOfUtcDay } from "../lib/recurrence.js";
import { Capture } from "../models/Capture.js";
import { Membership } from "../models/identity.js";
import { RecurringSchedule } from "../models/RecurringSchedule.js";


/**
 * Creates in-app notifications (and optional emails) for schedules that are due
 * within their reminder window or overdue. Idempotent per due date, so it is safe
 * to trigger often (e.g. a GitHub Actions cron hitting /internal/jobs/reminders).
 */
export async function runReminders(now = new Date()) {
  const today = startOfUtcDay(now);
  const candidates = await RecurringSchedule.find({ active: true, nextDueDate: { $lte: addDays(today, 60) } });
  let created = 0;
  let emailed = 0;

  for (const s of candidates) {
    const windowStart = addDays(s.nextDueDate, -(s.reminderDaysBefore ?? 3));
    if (windowStart > now) continue;
    if (s.lastRemindedFor && s.lastRemindedFor.getTime() === s.nextDueDate.getTime()) continue;

    const overdue = s.nextDueDate < today;
    const due = s.nextDueDate.toISOString().slice(0, 10);
    const amount = s.amountMinor != null ? ` (${s.currency} ${formatMinor(s.amountMinor)})` : "";
    const title = overdue ? `Overdue: ${s.title}` : `Due ${due}: ${s.title}`;
    const body = `${s.title}${s.counterparty ? ` to ${s.counterparty}` : ""}${amount} is ${overdue ? "overdue since" : "due on"} ${due}.`;

    const members = await Membership.find({ workspaceId: s.workspaceId, role: { $in: ["owner", "editor"] } }).lean();
    for (const m of members) {
      const r = await notifyUser({
        userId: m.userId,
        workspaceId: s.workspaceId,
        kind: overdue ? "overdue" : "due_soon",
        title,
        body,
        path: `/recurring/${s._id}`,
        scheduleId: s._id,
      });
      created++;
      if (r.emailed) emailed++;
    }
    s.lastRemindedFor = s.nextDueDate;
    await s.save();
  }

  const dated = await remindDatedCaptures(today, now);
  return { checked: candidates.length, created: created + dated.created, emailed: emailed + dated.emailed };
}

const DATED = [
  { kind: "expiring", path: "document.expiresAt", defaultDays: 30, verb: "expires" },
  { kind: "return", path: "returnBy", defaultDays: 3, verb: "last day to return is" },
  { kind: "warranty", path: "warrantyUntil", defaultDays: 14, verb: "warranty ends" },
] as const;

function getPath(obj: Record<string, unknown>, path: string): Date | undefined {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj) as Date | undefined;
}

/** Document expiries, return windows and warranty end dates, each notified once. */
async function remindDatedCaptures(today: Date, now: Date) {
  let created = 0;
  let emailed = 0;
  for (const rule of DATED) {
    // Look far enough ahead for the largest custom reminder window (120 days).
    const items = await Capture.find({
      deletedAt: { $exists: false },
      [rule.path]: { $gte: addDays(today, -1), $lte: addDays(today, 120) },
    }).select("+remindedFor");
    for (const c of items) {
      const date = getPath(c.toObject() as Record<string, unknown>, rule.path);
      if (!date) continue;
      const windowStart = addDays(date, -(c.reminderDaysBefore ?? rule.defaultDays));
      if (windowStart > now) continue;
      const key = `${rule.kind}:${date.toISOString().slice(0, 10)}`;
      if (c.remindedFor?.includes(key)) continue;

      const day = date.toISOString().slice(0, 10);
      const title = `${c.title}: ${rule.verb} ${day}`;
      // Private items only notify their creator.
      const recipients =
        c.visibility === "private"
          ? [{ userId: c.createdBy }]
          : await Membership.find({ workspaceId: c.workspaceId, role: { $in: ["owner", "editor"] } }).lean();
      for (const m of recipients) {
        const r = await notifyUser({
          userId: m.userId,
          workspaceId: c.workspaceId,
          kind: rule.kind,
          title,
          path: `/captures/${c._id}`,
          captureId: c._id,
        });
        created++;
        if (r.emailed) emailed++;
      }
      await Capture.updateOne({ _id: c._id }, { $addToSet: { remindedFor: key } });
    }
  }
  return { created, emailed };
}
