import { config } from "../config.js";
import { formatMinor } from "../lib/csv.js";
import { addDays, startOfUtcDay } from "../lib/recurrence.js";
import { Membership, User } from "../models/identity.js";
import { Notification, RecurringSchedule } from "../models/RecurringSchedule.js";

async function sendEmail(to: string, subject: string, text: string) {
  if (!config.RESEND_API_KEY || !config.REMINDER_FROM_EMAIL) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.REMINDER_FROM_EMAIL, to, subject, text }),
  });
  return res.ok;
}

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
      await Notification.create({ workspaceId: s.workspaceId, userId: m.userId, kind: overdue ? "overdue" : "due_soon", title, body, scheduleId: s._id });
      created++;
      const user = await User.findById(m.userId).lean();
      const wantsEmail = user && user.preferences?.emailReminders !== false;
      const to = user?.preferences?.reminderEmail || user?.email;
      if (wantsEmail && to && (await sendEmail(to, title, `${body}\n\nOpen: ${config.WEB_APP_URL}/recurring/${s._id}`))) emailed++;
    }
    s.lastRemindedFor = s.nextDueDate;
    await s.save();
  }
  return { checked: candidates.length, created, emailed };
}
