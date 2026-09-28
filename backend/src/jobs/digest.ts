import { config } from "../config.js";
import { formatMinor } from "../lib/csv.js";
import { sendEmail } from "../lib/notify.js";
import { addDays, startOfUtcDay } from "../lib/recurrence.js";
import { Capture } from "../models/Capture.js";
import { Membership, User } from "../models/identity.js";
import { RecurringSchedule } from "../models/RecurringSchedule.js";

const money = (minor: number, currency: string) => `${currency} ${formatMinor(minor)}`;

/**
 * Weekly summary email: bills due in the next 7 days, overdue bills,
 * reimbursements still owed, items waiting in the inbox and upcoming
 * deadlines. Sent at most once every 6.5 days per user, only when email
 * is configured and the user hasn't turned it off. Nothing sent if there's nothing to say.
 */
export async function runWeeklyDigest(now = new Date()) {
  if (!config.RESEND_API_KEY || !config.REMINDER_FROM_EMAIL) return { sent: 0, skipped: "email not configured" };
  const cutoff = new Date(now.getTime() - 6.5 * 86_400_000);
  const users = await User.find({
    "preferences.weeklyDigest": { $ne: false },
    $or: [{ lastDigestAt: { $exists: false } }, { lastDigestAt: { $lt: cutoff } }],
  }).lean();
  const today = startOfUtcDay(now);
  let sent = 0;

  for (const user of users) {
    const workspaceIds = (await Membership.find({ userId: user._id }).lean()).map((m) => m.workspaceId);
    const visible = { workspaceId: { $in: workspaceIds }, deletedAt: { $exists: false }, $or: [{ visibility: "workspace" }, { createdBy: user._id }] };
    const [dueSoon, overdue, owed, inbox, deadlines] = await Promise.all([
      RecurringSchedule.find({ workspaceId: { $in: workspaceIds }, active: true, nextDueDate: { $gte: today, $lte: addDays(today, 7) } }).lean(),
      RecurringSchedule.find({ workspaceId: { $in: workspaceIds }, active: true, nextDueDate: { $lt: today } }).lean(),
      Capture.find({ ...visible, "expense.reimbursable": true, "expense.reimbursement.status": { $ne: "reimbursed" } }).lean(),
      Capture.countDocuments({ ...visible, filed: false }),
      Capture.find({
        ...visible,
        $and: [
          {
            $or: [
              { "document.expiresAt": { $gte: today, $lte: addDays(today, 30) } },
              { returnBy: { $gte: today, $lte: addDays(today, 7) } },
              { warrantyUntil: { $gte: today, $lte: addDays(today, 30) } },
            ],
          },
        ],
      }).lean(),
    ]);

    const lines: string[] = [];
    if (overdue.length) {
      lines.push("OVERDUE");
      for (const s of overdue) lines.push(`  • ${s.title} — due ${s.nextDueDate.toISOString().slice(0, 10)}${s.amountMinor != null ? `, ${money(s.amountMinor, s.currency)}` : ""}`);
      lines.push("");
    }
    if (dueSoon.length) {
      lines.push("DUE THIS WEEK");
      for (const s of dueSoon) lines.push(`  • ${s.title} — ${s.nextDueDate.toISOString().slice(0, 10)}${s.amountMinor != null ? `, ${money(s.amountMinor, s.currency)}` : ""}`);
      lines.push("");
    }
    if (owed.length) {
      const byOrg = new Map<string, { n: number; minor: number; currency: string }>();
      for (const c of owed) {
        const org = c.organization || c.expense?.reimbursement?.organization || "Unassigned";
        const outstanding = (c.expense?.reimbursement?.amountOwedMinor ?? c.amountMinor ?? 0) - (c.expense?.reimbursement?.amountReimbursedMinor ?? 0);
        const cur = byOrg.get(org) ?? { n: 0, minor: 0, currency: c.currency ?? "USD" };
        cur.n++;
        cur.minor += outstanding;
        byOrg.set(org, cur);
      }
      lines.push("OWED TO YOU");
      for (const [org, v] of byOrg) lines.push(`  • ${org}: ${money(v.minor, v.currency)} (${v.n} item${v.n === 1 ? "" : "s"})`);
      lines.push("");
    }
    if (deadlines.length) {
      lines.push("COMING UP");
      for (const c of deadlines) {
        const d = c.document?.expiresAt ?? c.returnBy ?? c.warrantyUntil;
        const what = c.document?.expiresAt ? "expires" : c.returnBy ? "return by" : "warranty ends";
        lines.push(`  • ${c.title} — ${what} ${d?.toISOString().slice(0, 10)}`);
      }
      lines.push("");
    }
    if (inbox) lines.push(`${inbox} item${inbox === 1 ? "" : "s"} waiting in your inbox to be filed.`, "");
    if (!lines.length) continue;

    const to = user.preferences?.reminderEmail || user.email;
    const body = [`Hi ${user.name.split(" ")[0]},`, "", "Here's your week in Capture Hub:", "", ...lines, `Open: ${config.WEB_APP_URL}`, "", "Turn this off any time in Profile → Reminders."].join("\n");
    if (await sendEmail(to, "Your week in Capture Hub", body)) {
      sent++;
      await User.updateOne({ _id: user._id }, { lastDigestAt: now });
    }
  }
  return { sent };
}
