import type { Readable } from "node:stream";
import archiver from "archiver";
import { Router, type Request } from "express";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { z } from "zod";
import { buildCaptureFilter, captureFilters } from "../lib/captureQuery.js";
import { formatMinor, toCsv } from "../lib/csv.js";
import { badRequest } from "../lib/errors.js";
import { scope } from "../middleware/auth.js";
import { Attachment } from "../models/Attachment.js";
import { Capture, type CaptureDoc } from "../models/Capture.js";
import { storageFor } from "../storage/index.js";

export const exportsRouter = Router();

const MAX_FILE_BYTES = 25 * 1024 * 1024;

async function readAll(stream: Readable) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_FILE_BYTES) throw new Error("file too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function loadFile(att: { storage?: { driver: string; key: string } | null }) {
  return readAll(await storageFor(att.storage!.driver).get(att.storage!.key));
}

const safeName = (s: string) => s.replace(/[^\w\- .()]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "file";
const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
// Built-in PDF fonts only cover Latin-1; replace anything else so text never breaks the file.
const latin = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

/* ------------------------------------------------------------------ */
/* Reimbursement packet PDF                                            */
/* ------------------------------------------------------------------ */

const packetQuery = z.object({
  groupBy: z.enum(["organization", "trip"]).default("organization"),
  key: z.string().trim().min(1).max(200),
  includeDone: z.enum(["true", "false"]).default("false"),
});

class Writer {
  y = 0;
  page!: PDFPage;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([612, 792]); // US Letter
    this.y = 750;
  }
  text(s: string, opts: { size?: number; bold?: boolean; x?: number; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 10;
    if (this.y < 60) this.newPage();
    this.page.drawText(latin(s), {
      x: opts.x ?? 50,
      y: this.y,
      size,
      font: opts.bold ? this.bold : this.font,
      color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.12),
    });
  }
  line(gap = 14) {
    this.y -= gap;
  }
  fit(s: string, width: number, size = 10) {
    let out = latin(s);
    while (out.length > 1 && this.font.widthOfTextAtSize(out, size) > width) out = out.slice(0, -2) + "…".replace("…", ".");
    return out;
  }
}

/**
 * A single PDF you can send with a claim: summary table of what's owed,
 * then every receipt (images embedded, PDF receipts appended page by page).
 */
exportsRouter.get("/reimbursements/packet.pdf", async (req, res) => {
  const q = packetQuery.parse(req.query);
  const esc = q.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`^\\s*${esc}\\s*$`, "i");
  const keyFilter =
    q.groupBy === "trip"
      ? { trip: rx }
      : { $or: [{ organization: rx }, { organization: { $in: [null, ""] }, "expense.reimbursement.organization": rx }] };
  const items = await Capture.find({
    $and: [
      scope(req),
      { "expense.reimbursable": true },
      keyFilter,
      ...(q.includeDone === "true" ? [] : [{ "expense.reimbursement.status": { $ne: "reimbursed" } }]),
    ],
  })
    .sort({ occurredAt: 1 })
    .lean();
  if (!items.length) throw badRequest("Nothing to include for this group");

  const doc = await PDFDocument.create();
  doc.setTitle(`Reimbursement – ${q.key}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  const currency = items[0].currency ?? "USD";
  const owed = (c: (typeof items)[number]) => c.expense?.reimbursement?.amountOwedMinor ?? c.amountMinor ?? 0;
  const repaid = (c: (typeof items)[number]) => c.expense?.reimbursement?.amountReimbursedMinor ?? 0;
  const totalOwed = items.reduce((n, c) => n + owed(c), 0);
  const totalRepaid = items.reduce((n, c) => n + repaid(c), 0);

  w.text(`Reimbursement request: ${q.key}`, { size: 18, bold: true });
  w.line(22);
  w.text(`Prepared ${day(new Date())} · ${items.length} expense${items.length === 1 ? "" : "s"}`, { color: [0.4, 0.4, 0.45] });
  w.line(28);

  const cols = [50, 120, 300, 420, 500];
  w.text("Date", { bold: true, x: cols[0] });
  w.text("Description", { bold: true, x: cols[1] });
  w.text("Merchant", { bold: true, x: cols[2] });
  w.text("Status", { bold: true, x: cols[3] });
  w.text(`Owed (${currency})`, { bold: true, x: cols[4] });
  w.line(6);
  w.page.drawLine({ start: { x: 50, y: w.y }, end: { x: 562, y: w.y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.82) });
  w.line(14);
  items.forEach((c, i) => {
    w.text(day(c.occurredAt), { x: cols[0] });
    w.text(w.fit(`${i + 1}. ${c.title}`, 175), { x: cols[1] });
    w.text(w.fit(c.counterparty ?? "", 115), { x: cols[2] });
    w.text((c.expense?.reimbursement?.status ?? "to_submit").replace("_", " "), { x: cols[3] });
    w.text(formatMinor(owed(c)), { x: cols[4] });
    w.line();
  });
  w.line(6);
  w.page.drawLine({ start: { x: 50, y: w.y + 8 }, end: { x: 562, y: w.y + 8 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.82) });
  w.text("Total owed", { bold: true, x: cols[3] });
  w.text(formatMinor(totalOwed), { bold: true, x: cols[4] });
  if (totalRepaid) {
    w.line();
    w.text("Already repaid", { x: cols[3] });
    w.text(formatMinor(totalRepaid), { x: cols[4] });
    w.line();
    w.text("Outstanding", { bold: true, x: cols[3] });
    w.text(formatMinor(totalOwed - totalRepaid), { bold: true, x: cols[4] });
  }

  // Receipts, in the same order as the table.
  const missing: string[] = [];
  for (const [i, c] of items.entries()) {
    const atts = await Attachment.find({ _id: { $in: c.attachmentIds ?? [] }, deletedAt: { $exists: false } }).lean();
    if (!atts.length) missing.push(`${i + 1}. ${c.title}`);
    for (const att of atts) {
      const heading = `${i + 1}. ${c.title} · ${day(c.occurredAt)} · ${currency} ${formatMinor(owed(c))}`;
      try {
        const bytes = await loadFile(att);
        if (att.mimeType === "application/pdf") {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pages = await doc.copyPages(src, src.getPageIndices());
          pages.forEach((p, n) => {
            doc.addPage(p);
            if (n === 0) p.drawText(latin(heading).slice(0, 110), { x: 20, y: p.getHeight() - 14, size: 8, font, color: rgb(0.4, 0.4, 0.45) });
          });
          continue;
        }
        const img =
          att.mimeType === "image/png" ? await doc.embedPng(bytes) : att.mimeType === "image/jpeg" ? await doc.embedJpg(bytes) : null;
        if (!img) {
          missing.push(`${heading} (${att.filename}: ${att.mimeType} can't be embedded; see app)`);
          continue;
        }
        const page = doc.addPage([612, 792]);
        page.drawText(latin(heading).slice(0, 100), { x: 40, y: 760, size: 11, font: bold });
        const scale = Math.min(532 / img.width, 690 / img.height, 1);
        page.drawImage(img, { x: 40, y: 740 - img.height * scale, width: img.width * scale, height: img.height * scale });
      } catch {
        missing.push(`${heading} (${att.filename} could not be read)`);
      }
    }
  }
  if (missing.length) {
    w.newPage();
    w.text("Notes", { size: 14, bold: true });
    w.line(20);
    w.text("These items have no embeddable receipt in this packet:", { color: [0.4, 0.4, 0.45] });
    w.line(18);
    for (const m of missing) {
      w.text(w.fit(`• ${m}`, 510));
      w.line();
    }
  }

  const bytes = await doc.save();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="reimbursement-${safeName(q.key)}-${day(new Date())}.pdf"`);
  res.send(Buffer.from(bytes));
});

/* ------------------------------------------------------------------ */
/* Tax-year / accountant ZIP                                           */
/* ------------------------------------------------------------------ */

/**
 * ZIP with records.csv plus every attachment, filed as
 * receipts/<category>/<date> <title> - <file>. Uses the same filters as Activity.
 */
exportsRouter.get("/reports/export.zip", async (req: Request, res) => {
  const filter = buildCaptureFilter(req, captureFilters.parse(req.query));
  const items = await Capture.find(filter).sort({ occurredAt: 1, createdAt: 1 }).limit(3000).lean();

  const label = typeof req.query.from === "string" ? req.query.from.slice(0, 4) : day(new Date());
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="capture-hub-${safeName(label)}.zip"`);

  const zip = archiver("zip", { zlib: { level: 6 } });
  zip.on("warning", (err) => req.log?.warn({ err }, "zip warning"));
  zip.on("error", (err) => {
    req.log?.error({ err }, "zip failed");
    res.destroy(err);
  });
  zip.pipe(res);

  const rows: unknown[][] = [];
  const usedNames = new Set<string>();
  for (const c of items as CaptureDoc[]) {
    const atts = await Attachment.find({ _id: { $in: c.attachmentIds ?? [] }, deletedAt: { $exists: false } }).lean();
    const files: string[] = [];
    for (const att of atts) {
      const folder = safeName(c.category || c.type);
      let name = `receipts/${folder}/${day(c.occurredAt ?? c.createdAt)} ${safeName(c.title)} - ${safeName(att.filename)}`;
      for (let n = 2; usedNames.has(name); n++) name = name.replace(/( \(\d+\))?(\.\w+)?$/, ` (${n})$2`);
      usedNames.add(name);
      try {
        zip.append(await loadFile(att), { name });
        files.push(name);
      } catch {
        files.push(`(missing: ${att.filename})`);
      }
    }
    rows.push([
      c.occurredAt ?? c.createdAt,
      c.type,
      c.title,
      c.counterparty,
      formatMinor(c.amountMinor),
      c.currency,
      c.category,
      c.property,
      c.trip,
      c.organization ?? c.expense?.reimbursement?.organization,
      (c.tags ?? []).join("; "),
      c.payment?.confirmationNumber,
      files.join(" | "),
      c.notes,
    ]);
  }
  zip.append(
    "﻿" +
      toCsv(
        ["Date", "Type", "Title", "Counterparty", "Amount", "Currency", "Category", "Property", "Trip", "Organization", "Tags", "Confirmation #", "Files", "Notes"],
        rows,
      ),
    { name: "records.csv" },
  );
  await zip.finalize();
});
