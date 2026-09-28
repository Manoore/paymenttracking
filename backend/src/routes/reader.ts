import crypto from "node:crypto";
import type { Readable } from "node:stream";
import { Router, type Request } from "express";
import multer from "multer";
import type { Types } from "mongoose";
import { z } from "zod";
import { config } from "../config.js";
import { badRequest, forbidden, HttpError, notFound } from "../lib/errors.js";
import { decryptSecret, encryptSecret, maskKey } from "../lib/secrets.js";
import { objectId } from "../lib/validation.js";
import { ctx, requireAuth, requireWrite } from "../middleware/auth.js";
import { Attachment } from "../models/Attachment.js";
import { Capture } from "../models/Capture.js";
import { Workspace } from "../models/identity.js";
import { ReadCache } from "../models/ReadCache.js";
import { PROVIDER_INFO, PROVIDERS, readerFor, ReaderError, type Extraction, type ProviderConfig, type ProviderId } from "../readers/index.js";
import { storageFor } from "../storage/index.js";
import { loadCapture } from "./captures.js";

export const readerRouter = Router();

const READABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });
const month = () => new Date().toISOString().slice(0, 7);

function sniff(buf: Buffer) {
  const hex = buf.subarray(0, 12).toString("hex");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e47")) return "image/png";
  if (hex.startsWith("47494638")) return "image/gif";
  if (hex.startsWith("25504446")) return "application/pdf";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(4, 8).toString() === "ftyp") return "image/heic";
  return null;
}

/**
 * The custom URL for "OpenAI-compatible" providers is fetched by the server, so
 * only public HTTPS hosts are allowed (no localhost / private networks).
 */
function assertSafeBaseUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw badRequest("Enter a valid URL, e.g. https://openrouter.ai/api/v1");
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80");
  if (u.protocol !== "https:" || privateHost) throw badRequest("The service URL must be a public https:// address");
  return u.toString().replace(/\/+$/, "");
}

async function workspaceAi(workspaceId: Types.ObjectId) {
  const ws = await Workspace.findById(workspaceId).select("+ai.apiKeyEnc");
  if (!ws) throw notFound("Workspace");
  return ws;
}

function publicSettings(ws: Awaited<ReturnType<typeof workspaceAi>>, role: string) {
  const ai = ws.ai;
  const configured = Boolean(ai?.provider && ai?.apiKeyEnc && ai?.model);
  return {
    configured,
    provider: ai?.provider ?? null,
    providerLabel: ai?.provider ? PROVIDER_INFO[ai.provider as ProviderId].label : null,
    model: ai?.model ?? null,
    baseUrl: ai?.baseUrl ?? null,
    keyHint: ai?.keyHint ?? null,
    autoRead: ai?.autoRead ?? true,
    monthlyLimit: ai?.monthlyLimit ?? 200,
    usedThisMonth: ai?.usageMonth === month() ? (ai?.usageCount ?? 0) : 0,
    canManage: role === "owner",
  };
}

/**
 * Read a file with the workspace's provider. Cached by SHA-256 per workspace,
 * and counted against the monthly limit only when the provider is called.
 */
export async function readForWorkspace(workspaceId: Types.ObjectId, input: { bytes: Buffer; mimeType: string; filename: string }) {
  if (!READABLE.has(input.mimeType)) {
    throw new HttpError(
      415,
      input.mimeType === "image/heic"
        ? "HEIC photos can't be read yet. On iPhone, set Camera → Formats → Most Compatible, or share as JPEG."
        : "Only photos (JPEG, PNG, WebP) and PDFs can be read",
      "unsupported_file",
    );
  }
  const sha256 = crypto.createHash("sha256").update(input.bytes).digest("hex");
  const cached = await ReadCache.findOne({ workspaceId, sha256 }).lean();
  if (cached) return { fields: cached.fields as Extraction, provider: cached.provider, model: cached.model, cached: true, sha256 };

  const ws = await workspaceAi(workspaceId);
  const ai = ws.ai;
  if (!ai?.provider || !ai.apiKeyEnc || !ai.model) {
    throw new HttpError(409, "Document reading isn't set up. The space owner can add an API key in Profile → Document reading.", "reader_not_configured");
  }
  const used = ai.usageMonth === month() ? (ai.usageCount ?? 0) : 0;
  if (used >= (ai.monthlyLimit ?? 200)) {
    throw new HttpError(429, `This month's limit of ${ai.monthlyLimit} reads is used up. The owner can raise it in settings.`, "reader_limit");
  }

  const cfg: ProviderConfig = { apiKey: decryptSecret(ai.apiKeyEnc), model: ai.model, baseUrl: ai.baseUrl ?? undefined };
  let fields: Extraction;
  try {
    fields = await readerFor(ai.provider as ProviderId).read(cfg, input);
  } catch (err) {
    if (err instanceof ReaderError) throw new HttpError(err.status, err.message, "reader_failed");
    throw err;
  }
  // Count the call (atomic; resets at the start of each month).
  const m = month();
  await Workspace.updateOne({ _id: workspaceId, "ai.usageMonth": m }, { $inc: { "ai.usageCount": 1 } }).then(async (r) => {
    if (!r.matchedCount) await Workspace.updateOne({ _id: workspaceId }, { "ai.usageMonth": m, "ai.usageCount": 1 });
  });
  await ReadCache.updateOne(
    { workspaceId, sha256 },
    { $setOnInsert: { fields, provider: ai.provider, model: ai.model } },
    { upsert: true },
  );
  return { fields, provider: ai.provider, model: ai.model, cached: false, sha256 };
}

/** Called after an upload: reuse a reading made before the record was saved. */
export async function applyCachedReading(att: { workspaceId: Types.ObjectId; sha256: string; _id: Types.ObjectId }) {
  const cached = await ReadCache.findOne({ workspaceId: att.workspaceId, sha256: att.sha256 }).lean();
  if (!cached) return false;
  const fields = cached.fields as Extraction;
  await Attachment.updateOne(
    { _id: att._id },
    { extraction: { provider: cached.provider, model: cached.model, at: new Date(), fields }, extractedText: fields.fullText?.slice(0, 50_000) },
  );
  return true;
}

/* ---------------------------- settings ---------------------------- */

readerRouter.get("/reader/providers", requireAuth, (_req, res) => {
  res.json({ providers: PROVIDERS.map((id) => ({ id, ...PROVIDER_INFO[id] })) });
});

readerRouter.get("/workspaces/current/reader", requireAuth, async (req, res) => {
  const { workspaceId, role } = ctx(req);
  res.json(publicSettings(await workspaceAi(workspaceId), role));
});

const settingsInput = z.object({
  provider: z.enum(PROVIDERS),
  model: z.string().trim().min(1).max(100).optional(),
  baseUrl: z.string().trim().max(500).nullish(),
  apiKey: z.string().trim().min(8).max(500).optional(),
  autoRead: z.boolean().optional(),
  monthlyLimit: z.number().int().min(1).max(100_000).optional(),
});

function requireOwner(req: Request) {
  if (ctx(req).role !== "owner") throw forbidden("Only the space owner can change document reading settings");
}

readerRouter.put("/workspaces/current/reader", requireAuth, async (req, res) => {
  requireOwner(req);
  const body = settingsInput.parse(req.body);
  const { workspaceId, role } = ctx(req);
  const ws = await workspaceAi(workspaceId);
  const current = ws.ai;
  const switchingProvider = current?.provider !== body.provider;
  if (!body.apiKey && (switchingProvider || !current?.apiKeyEnc)) throw badRequest("Enter the API key for this provider");
  const info = PROVIDER_INFO[body.provider];
  const model = body.model || (switchingProvider ? info.defaultModel : current?.model) || info.defaultModel;
  if (!model) throw badRequest("Enter the model name to use");
  let baseUrl: string | undefined;
  if (info.needsBaseUrl) {
    if (!body.baseUrl && !(current?.baseUrl && !switchingProvider)) throw badRequest("Enter the service URL");
    baseUrl = body.baseUrl ? assertSafeBaseUrl(body.baseUrl) : (current?.baseUrl ?? undefined);
  }

  ws.set("ai.provider", body.provider);
  ws.set("ai.model", model);
  ws.set("ai.baseUrl", baseUrl);
  if (body.apiKey) {
    ws.set("ai.apiKeyEnc", encryptSecret(body.apiKey));
    ws.set("ai.keyHint", maskKey(body.apiKey));
  }
  if (body.autoRead !== undefined) ws.set("ai.autoRead", body.autoRead);
  if (body.monthlyLimit !== undefined) ws.set("ai.monthlyLimit", body.monthlyLimit);
  ws.set("ai.updatedAt", new Date());
  await ws.save();
  res.json(publicSettings(await workspaceAi(workspaceId), role));
});

/** Checks a key+model without saving (fields from the form), or the saved settings. */
readerRouter.post("/workspaces/current/reader/test", requireAuth, async (req, res) => {
  requireOwner(req);
  const body = settingsInput.partial().parse(req.body ?? {});
  const ws = await workspaceAi(ctx(req).workspaceId);
  const provider = (body.provider ?? ws.ai?.provider) as ProviderId | undefined;
  if (!provider) throw badRequest("Choose a provider");
  const sameProvider = provider === ws.ai?.provider;
  const apiKey = body.apiKey || (sameProvider && ws.ai?.apiKeyEnc ? decryptSecret(ws.ai.apiKeyEnc) : undefined);
  if (!apiKey) throw badRequest("Enter the API key to test");
  const model = body.model || (sameProvider ? ws.ai?.model : undefined) || PROVIDER_INFO[provider].defaultModel;
  const rawBase = body.baseUrl || (sameProvider ? ws.ai?.baseUrl : undefined);
  const baseUrl = PROVIDER_INFO[provider].needsBaseUrl ? (rawBase ? assertSafeBaseUrl(rawBase) : undefined) : undefined;
  if (PROVIDER_INFO[provider].needsBaseUrl && !baseUrl) throw badRequest("Enter the service URL");
  try {
    await readerFor(provider).test({ apiKey, model: model!, baseUrl });
  } catch (err) {
    if (err instanceof ReaderError) return res.status(200).json({ ok: false, message: err.message });
    throw err;
  }
  res.json({ ok: true, message: `Key works with ${model}` });
});

readerRouter.delete("/workspaces/current/reader", requireAuth, async (req, res) => {
  requireOwner(req);
  await Workspace.updateOne({ _id: ctx(req).workspaceId }, { $unset: { ai: 1 } });
  res.status(204).end();
});

/* ---------------------------- reading ---------------------------- */

/** Read a file before the record exists (New capture auto-fill). Nothing is stored except the cached reading. */
readerRouter.post("/reader/extract", requireAuth, requireWrite, upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest("No file uploaded (field name: file)");
  const mimeType = sniff(file.buffer);
  if (!mimeType) throw new HttpError(415, "Only photos (JPEG, PNG, WebP) and PDFs can be read", "unsupported_file");
  const result = await readForWorkspace(ctx(req).workspaceId, { bytes: file.buffer, mimeType, filename: file.originalname || "file" });
  res.json(result);
});

async function readAll(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** Read an attachment that is already saved ("Read with AI" on a record). */
readerRouter.post("/attachments/:id/read", requireAuth, requireWrite, async (req, res) => {
  const id = String(req.params.id);
  if (!objectId.safeParse(id).success) throw notFound("Attachment");
  const att = await Attachment.findOne({ _id: id, workspaceId: ctx(req).workspaceId, deletedAt: { $exists: false } });
  if (!att) throw notFound("Attachment");
  if (att.captureId) await loadCapture(req, att.captureId.toString());
  const bytes = await readAll(await storageFor(att.storage!.driver).get(att.storage!.key));
  const result = await readForWorkspace(ctx(req).workspaceId, { bytes, mimeType: att.mimeType, filename: att.filename });
  att.set("extraction", { provider: result.provider, model: result.model, at: new Date(), fields: result.fields });
  att.set("extractedText", result.fields.fullText?.slice(0, 50_000));
  await att.save();
  if (att.captureId) {
    // Mirror into the record's searchable text.
    const texts = await Attachment.find({ captureId: att.captureId, deletedAt: { $exists: false } }).select("+extractedText").lean();
    await Capture.updateOne(
      { _id: att.captureId },
      { extractedText: texts.map((t) => t.extractedText).filter(Boolean).join("\n").slice(0, 100_000) },
    );
  }
  res.json(result);
});
