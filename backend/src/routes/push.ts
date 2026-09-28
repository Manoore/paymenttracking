import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { sendPush } from "../lib/notify.js";
import { ctx, requireAuth } from "../middleware/auth.js";
import { User } from "../models/identity.js";

export const pushRouter = Router();

/** Public key the browser needs to create a push subscription (null = push not configured). */
pushRouter.get("/key", (_req, res) => {
  res.json({ publicKey: config.VAPID_PUBLIC_KEY ?? null });
});

const subscription = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
});

pushRouter.post("/subscribe", requireAuth, async (req, res) => {
  const sub = subscription.parse(req.body);
  const { userId } = ctx(req);
  // Replace any existing entry for this device, keep at most 10 devices.
  await User.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } });
  await User.updateOne(
    { _id: userId },
    {
      $push: {
        pushSubscriptions: {
          $each: [{ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: req.get("user-agent")?.slice(0, 200) }],
          $slice: -10,
        },
      },
    },
  );
  res.status(201).json({ ok: true });
});

pushRouter.post("/unsubscribe", requireAuth, async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
  await User.updateOne({ _id: ctx(req).userId }, { $pull: { pushSubscriptions: { endpoint } } });
  res.status(204).end();
});

pushRouter.post("/test", requireAuth, async (req, res) => {
  const sent = await sendPush(ctx(req).userId, { title: "Capture Hub", body: "Notifications are working on this device.", url: "/" });
  res.json({ sent });
});
