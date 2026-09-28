import webpush from "web-push";
import type { Types } from "mongoose";
import { config } from "../config.js";
import { User } from "../models/identity.js";
import { Notification } from "../models/RecurringSchedule.js";

let vapidReady = false;
function pushEnabled() {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
    vapidReady = true;
  }
  return true;
}

export async function sendEmail(to: string, subject: string, text: string) {
  if (!config.RESEND_API_KEY || !config.REMINDER_FROM_EMAIL) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.REMINDER_FROM_EMAIL, to, subject, text }),
  });
  return res.ok;
}

/** Push to every device the user enabled; prunes subscriptions the browser revoked. */
export async function sendPush(userId: Types.ObjectId | string, payload: { title: string; body?: string; url?: string }) {
  if (!pushEnabled()) return 0;
  const user = await User.findById(userId).select("+pushSubscriptions");
  if (!user?.pushSubscriptions?.length) return 0;
  let sent = 0;
  const dead: string[] = [];
  for (const sub of user.pushSubscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24 },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) dead.push(sub.endpoint);
    }
  }
  if (dead.length) await User.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: { $in: dead } } } });
  return sent;
}

/**
 * One place that fans a reminder out to every channel: in-app notification,
 * email (if the user wants it and email is configured) and web push.
 */
export async function notifyUser(input: {
  userId: Types.ObjectId;
  workspaceId: Types.ObjectId;
  kind: "due_soon" | "overdue" | "expiring" | "return" | "warranty";
  title: string;
  body?: string;
  path: string;
  scheduleId?: Types.ObjectId;
  captureId?: Types.ObjectId;
}) {
  await Notification.create({
    workspaceId: input.workspaceId,
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    scheduleId: input.scheduleId,
    captureId: input.captureId,
  });
  const user = await User.findById(input.userId).lean();
  let emailed = false;
  const to = user?.preferences?.reminderEmail || user?.email;
  if (user?.preferences?.emailReminders !== false && to) {
    emailed = await sendEmail(to, input.title, `${input.body ?? input.title}\n\nOpen: ${config.WEB_APP_URL}${input.path}`);
  }
  await sendPush(input.userId, { title: input.title, body: input.body, url: input.path });
  return { emailed };
}
