import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { runWeeklyDigest } from "../src/jobs/digest.js";
import { User } from "../src/models/identity.js";

const app = createApp();
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d50000000049454e44ae426082",
  "hex",
);

async function session() {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "me@example.com", password: "correct-horse-battery", name: "Me" })
    .expect(201);
  return { Authorization: `Bearer ${res.body.accessToken}` };
}

function binary(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
}

async function expenseWithReceipt(auth: Record<string, string>, body: object, file: { buf: Buffer; name: string; type: string }) {
  const c = await request(app).post("/api/v1/captures").set(auth).send(body).expect(201);
  await request(app)
    .post("/api/v1/attachments")
    .set(auth)
    .field("captureId", c.body._id)
    .attach("files", file.buf, { filename: file.name, contentType: file.type })
    .expect(201);
  return c.body;
}

describe("reimbursement packet PDF", () => {
  it("builds a summary page plus receipts (images and PDFs)", async () => {
    const auth = await session();
    const receiptPdf = await PDFDocument.create();
    receiptPdf.addPage([300, 400]);
    receiptPdf.addPage([300, 400]);
    const pdfBytes = Buffer.from(await receiptPdf.save());

    await expenseWithReceipt(
      auth,
      { type: "expense", title: "Diwali lights", amountMinor: 5000, organization: "India Club", expense: { reimbursable: true } },
      { buf: PNG, name: "lights.png", type: "image/png" },
    );
    await expenseWithReceipt(
      auth,
      { type: "expense", title: "Sweets – Hyderabad House", amountMinor: 3000, organization: "india club", expense: { reimbursable: true } },
      { buf: pdfBytes, name: "sweets.pdf", type: "application/pdf" },
    );

    const res = await request(app)
      .get("/api/v1/reimbursements/packet.pdf?groupBy=organization&key=India%20Club")
      .set(auth)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    const pdf = await PDFDocument.load(res.body as Buffer);
    // 1 summary + 1 image page + 2 pages from the attached PDF
    expect(pdf.getPageCount()).toBe(4);

    await request(app).get("/api/v1/reimbursements/packet.pdf?key=Nobody").set(auth).expect(400);
  });
});

describe("ZIP export", () => {
  it("includes records.csv and receipts filed by category", async () => {
    const auth = await session();
    await expenseWithReceipt(
      auth,
      { type: "expense", title: "Plumber", amountMinor: 20000, category: "Repairs", occurredAt: "2026-03-02" },
      { buf: PNG, name: "invoice.png", type: "image/png" },
    );
    const res = await request(app).get("/api/v1/reports/export.zip?from=2026-01-01&to=2026-12-31").set(auth).buffer(true).parse(binary).expect(200);
    const zip = (res.body as Buffer).toString("latin1");
    expect(zip.startsWith("PK")).toBe(true);
    expect(zip).toContain("records.csv");
    expect(zip).toContain("receipts/Repairs/2026-03-02 Plumber - invoice.png");
  });
});

describe("push subscriptions", () => {
  it("exposes the key and stores/removes device subscriptions", async () => {
    const auth = await session();
    const key = await request(app).get("/api/v1/push/key").expect(200);
    expect(key.body).toHaveProperty("publicKey");
    const sub = { endpoint: "https://push.example.com/abc", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
    await request(app).post("/api/v1/push/subscribe").set(auth).send(sub).expect(201);
    await request(app).post("/api/v1/push/subscribe").set(auth).send(sub).expect(201); // same device twice = one entry
    const u = await User.findOne({ email: "me@example.com" }).select("+pushSubscriptions");
    expect(u?.pushSubscriptions).toHaveLength(1);
    await request(app).post("/api/v1/push/unsubscribe").set(auth).send({ endpoint: sub.endpoint }).expect(204);
    const u2 = await User.findOne({ email: "me@example.com" }).select("+pushSubscriptions");
    expect(u2?.pushSubscriptions).toHaveLength(0);
  });

  it("skips the weekly digest when email isn't configured", async () => {
    await session();
    expect(await runWeeklyDigest()).toMatchObject({ sent: 0, skipped: "email not configured" });
  });
});
