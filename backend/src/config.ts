import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  // Comma-separated list of allowed browser origins (the Vercel web app).
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  // Personal-first: signup is closed once the first account exists unless explicitly opened.
  ALLOW_SIGNUP: z.enum(["true", "false"]).default("false"),
  MAX_UPLOAD_MB: z.coerce.number().default(15),
  CRON_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  REMINDER_FROM_EMAIL: z.string().optional(),
  WEB_APP_URL: z.string().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  // Forgive common copy/paste slips: quotes, spaces, trailing slashes, upper case, missing scheme.
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "").toLowerCase())
    .filter(Boolean)
    .map((s) => (/^https?:\/\//.test(s) ? s : `${s.startsWith("localhost") ? "http" : "https"}://${s}`)),
  allowSignup: parsed.data.ALLOW_SIGNUP === "true",
  isProd: parsed.data.NODE_ENV === "production",
};
