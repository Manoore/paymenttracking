import crypto from "node:crypto";
import { Router } from "express";
import { config } from "../config.js";
import { notFound } from "../lib/errors.js";
import { toIcs, type IcsEvent } from "../lib/ics.js";
import { addDays, nextDueDate, startOfUtcDay, type Frequency } from "../lib/recurrence.js";
import { formatMinor } from "../lib/csv.js";
import { ctx, requireAuth } from "../middleware/auth.js";
import { Capture } from "../models/Capture.js";
import { Membership, User } from "../models/identity.js";
import { RecurringSchedule } from "../models/RecurringSchedule.js";

export const calendarRouter = Router();

function feedUrl(req: { protocol: string; get(h: string): string | undefined }, token: string) {
  return `${req.protocol}://${req.get("host")}/calendar/${token}.ics`;
}

/** Get (creating on first use) or rotate the private calendar feed URL. */
calendarRouter.post("/api/v1/calendar/feed", requireAuth, async (req, res) => {
  const { userId } = ctx(req);
  const user = await User.findById(userId).select("+calendarToken");
  if (!user) throw notFound("User");
  if (!user.calendarToken || req.query.rotate === "1") {
    user.calendarToken = crypto.randomBytes(24).toString("base64url");
    await user.save();
  }
  res.json({ url: feedUrl(req, user.calendarToken) });
});

/**
 * Read-only feed for Google/Apple/Outlook calendars: bill due dates (next 12
 * occurrences), document expiries, return and warranty deadlines. The token in
 * the URL is the only credential, so the feed never includes attachments.
 */
calendarRouter.get("/calendar/:token.ics", async (req, res) => {
  const token = String(req.params.token);
  if (token.length < 20) throw notFound("Calendar");
  const user = await User.findOne({ calendarToken: token }).lean();
  if (!user) throw notFound("Calendar");
  const workspaceIds = (await Membership.find({ userId: user._id }).lean()).map((m) => m.workspaceId);

  const today = startOfUtcDay();
  const horizon = addDays(today, 400);
  const events: IcsEvent[] = [];
  const open = (path: string) => `${config.WEB_APP_URL}${path}`;

  const schedules = await RecurringSchedule.find({ workspaceId: { $in: workspaceIds }, active: true }).lean();
  for (const s of schedules) {
    let due = s.nextDueDate;
    for (let i = 0; i < 12 && due <= horizon; i++) {
      const amount = s.amountMinor != null ? ` (${s.currency} ${formatMinor(s.amountMinor)})` : "";
      events.push({
        uid: `sched-${s._id}-${due.toISOString().slice(0, 10)}@capturehub`,
        date: due,
        title: `Due: ${s.title}${amount}`,
        description: s.counterparty ? `Pay ${s.counterparty}` : undefined,
        url: open(`/recurring/${s._id}`),
      });
      due = nextDueDate(due, s.frequency as Frequency, s.anchorDay ?? undefined);
    }
  }

  const dated = await Capture.find({
    workspaceId: { $in: workspaceIds },
    deletedAt: { $exists: false },
    $and: [
      { $or: [{ visibility: "workspace" }, { createdBy: user._id }] },
      {
        $or: [
          { "document.expiresAt": { $gte: addDays(today, -30) } },
          { returnBy: { $gte: addDays(today, -7) } },
          { warrantyUntil: { $gte: addDays(today, -7) } },
        ],
      },
    ],
  })
    .limit(500)
    .lean();
  for (const c of dated) {
    if (c.document?.expiresAt)
      events.push({ uid: `doc-${c._id}@capturehub`, date: c.document.expiresAt, title: `Expires: ${c.title}`, url: open(`/captures/${c._id}`) });
    if (c.returnBy) events.push({ uid: `ret-${c._id}@capturehub`, date: c.returnBy, title: `Last day to return: ${c.title}`, url: open(`/captures/${c._id}`) });
    if (c.warrantyUntil)
      events.push({ uid: `war-${c._id}@capturehub`, date: c.warrantyUntil, title: `Warranty ends: ${c.title}`, url: open(`/captures/${c._id}`) });
  }

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "private, max-age=900");
  res.send(toIcs("Capture Hub", events));
});
