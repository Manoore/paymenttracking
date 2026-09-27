import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { config } from "../config.js";
import { badRequest, notFound } from "../lib/errors.js";
import { signFileToken, verifyFileToken } from "../lib/tokens.js";
import { objectId } from "../lib/validation.js";
import { ctx, requireWrite } from "../middleware/auth.js";
import { Attachment } from "../models/Attachment.js";
import { Capture } from "../models/Capture.js";
import { storage, storageFor } from "../storage/index.js";
import { loadCapture } from "./captures.js";

export const attachmentsRouter = Router();
/** Public router: serves a file only with a valid signed `sig` for that attachment. */
export const filesRouter = Router();

type AttachmentLike = { _id: { toString(): string }; mimeType: string; size: number; filename: string; storage?: { driver: string; key: string } | null };

/** Attach a signed, expiring URL (relative to the API origin) that clients can load directly. */
export function withUrl<T extends { _id: { toString(): string } }>(att: T) {
  const id = att._id.toString();
  return { ...att, url: `/files/${id}?sig=${signFileToken(id)}` };
}

function streamAttachment(req: Request, res: Response, att: AttachmentLike) {
  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Type", att.mimeType);
  res.setHeader("Content-Length", String(att.size));
  res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(att.filename)}"`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  void storageFor(att.storage!.driver)
    .get(att.storage!.key)
    .then((stream) => {
      stream.on("error", (err) => {
        req.log?.error({ err }, "attachment stream failed");
        if (!res.headersSent) res.status(500).end();
        else res.destroy(err);
      });
      stream.pipe(res);
    })
    .catch((err) => {
      req.log?.error({ err }, "attachment open failed");
      if (!res.headersSent) res.status(500).end();
    });
}

filesRouter.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  const sig = typeof req.query.sig === "string" ? req.query.sig : "";
  if (!objectId.safeParse(id).success || !verifyFileToken(sig, id)) throw notFound("File");
  const att = await Attachment.findOne({ _id: id, deletedAt: { $exists: false } });
  if (!att) throw notFound("File");
  streamAttachment(req, res, att);
});

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
  "text/plain",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
});

/** Check real file signatures, not just the client-provided MIME type. */
function sniff(buf: Buffer, claimed: string): string | null {
  const hex = buf.subarray(0, 12).toString("hex");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e47")) return "image/png";
  if (hex.startsWith("47494638")) return "image/gif";
  if (hex.startsWith("25504446")) return "application/pdf";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(4, 8).toString() === "ftyp") return claimed === "image/heif" ? "image/heif" : "image/heic";
  if (claimed === "text/plain" && !buf.subarray(0, 4096).includes(0)) return "text/plain";
  return null;
}

async function loadAttachment(req: Request, id: string) {
  if (!objectId.safeParse(id).success) throw notFound("Attachment");
  const att = await Attachment.findOne({ _id: id, workspaceId: ctx(req).workspaceId, deletedAt: { $exists: false } });
  if (!att) throw notFound("Attachment");
  // Attachments inherit their capture's visibility.
  if (att.captureId) await loadCapture(req, att.captureId.toString());
  return att;
}

attachmentsRouter.post("/", requireWrite, upload.array("files", 10), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw badRequest("No files uploaded (field name: files)");
  const { workspaceId, userId } = ctx(req);
  const captureId = typeof req.body?.captureId === "string" && req.body.captureId ? req.body.captureId : undefined;
  const capture = captureId ? await loadCapture(req, captureId) : null;

  const created = [];
  for (const file of files) {
    const mimeType = sniff(file.buffer, file.mimetype);
    if (!mimeType || !ALLOWED.has(mimeType)) throw badRequest(`Unsupported file type: ${file.originalname}`);
    const filename = file.originalname.replace(/[^\w.\- ()]/g, "_").slice(0, 200) || "file";
    const key = await storage().put({ buffer: file.buffer, filename, mimeType, workspaceId: workspaceId.toString() });
    const att = await Attachment.create({
      workspaceId,
      uploadedBy: userId,
      captureId: capture?._id,
      filename,
      mimeType,
      size: file.size,
      sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
      storage: { driver: storage().driver, key },
      extractedText: mimeType === "text/plain" ? file.buffer.toString("utf8").slice(0, 50_000) : undefined,
    });
    created.push(att);
  }

  if (capture) {
    capture.attachmentIds.push(...created.map((a) => a._id));
    await capture.save();
    await syncExtractedText(capture._id.toString());
  }
  res.status(201).json({ items: created.map((a) => withUrl(a.toObject())) });
});

/** Mirror attachment text onto the capture so a single query searches both. */
async function syncExtractedText(captureId: string) {
  const atts = await Attachment.find({ captureId, deletedAt: { $exists: false } }).select("+extractedText").lean();
  const text = atts.map((a) => a.extractedText).filter(Boolean).join("\n").slice(0, 100_000);
  await Capture.updateOne({ _id: captureId }, text ? { extractedText: text } : { $unset: { extractedText: 1 } });
}

attachmentsRouter.get("/:id", async (req, res) => {
  const att = await loadAttachment(req, String(req.params.id));
  res.json(withUrl(att.toObject()));
});

attachmentsRouter.get("/:id/content", async (req, res) => {
  const att = await loadAttachment(req, String(req.params.id));
  streamAttachment(req, res, att);
});

attachmentsRouter.delete("/:id", requireWrite, async (req, res) => {
  const att = await loadAttachment(req, String(req.params.id));
  att.deletedAt = new Date();
  await att.save();
  if (att.captureId) {
    await Capture.updateOne({ _id: att.captureId }, { $pull: { attachmentIds: att._id } });
    await syncExtractedText(att.captureId.toString());
  }
  res.status(204).end();
});
