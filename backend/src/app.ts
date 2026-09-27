import crypto from "node:crypto";
import cors from "cors";
import express, { Router } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { unauthorized } from "./lib/errors.js";
import { runReminders } from "./jobs/reminders.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { attachmentsRouter, filesRouter } from "./routes/attachments.js";
import { authRouter } from "./routes/auth.js";
import { capturesRouter } from "./routes/captures.js";
import { insightsRouter } from "./routes/insights.js";
import { recurringRouter } from "./routes/recurring.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // Render terminates TLS in front of the app
  app.disable("x-powered-by");

  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
      allowedHeaders: ["Authorization", "Content-Type", "X-Workspace-Id"],
      methods: ["GET", "POST", "PATCH", "DELETE"],
      maxAge: 600,
    }),
  );
  if (config.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        redact: ["req.headers.authorization", "req.headers.cookie", "req.body.password", "req.body.refreshToken"],
        autoLogging: { ignore: (req) => req.url === "/health" },
      }),
    );
  }
  app.use(express.json({ limit: "1mb" }));
  app.use(
    rateLimit({ windowMs: 60_000, limit: config.NODE_ENV === "test" ? 10_000 : 300, standardHeaders: "draft-8", legacyHeaders: false }),
  );

  app.get("/health", (_req, res) => res.json({ ok: true }));

  const api = Router();
  api.use("/auth", authRouter);
  api.use("/captures", requireAuth, capturesRouter);
  api.use("/attachments", requireAuth, attachmentsRouter);
  api.use("/recurring", requireAuth, recurringRouter);
  api.use("/", requireAuth, insightsRouter);
  app.use("/api/v1", api);
  app.use("/files", filesRouter);

  // Scheduled jobs, triggered externally with a shared secret.
  app.post("/internal/jobs/reminders", async (req, res) => {
    const given = req.get("x-cron-secret") ?? "";
    const expected = config.CRON_SECRET ?? "";
    const ok =
      expected.length > 0 &&
      given.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!ok) throw unauthorized();
    res.json(await runReminders());
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
