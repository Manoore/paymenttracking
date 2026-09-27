import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { runReminders } from "../src/jobs/reminders.js";
import { Membership, User, Workspace } from "../src/models/identity.js";

const app = createApp();
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d50000000049454e44ae426082",
  "hex",
);

async function register(email = "me@example.com") {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "correct-horse-battery", name: "Me" })
    .expect(201);
  return res.body as { accessToken: string; refreshToken: string; user: { id: string; defaultWorkspaceId: string } };
}

describe("auth", () => {
  it("registers the first user with a personal workspace, then closes signup", async () => {
    const s = await register();
    expect(s.accessToken).toBeTruthy();
    const ws = await Workspace.findById(s.user.defaultWorkspaceId);
    expect(ws?.kind).toBe("personal");

    const second = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "other@example.com", password: "correct-horse-battery", name: "Other" });
    expect(second.status).toBe(403);
  });

  it("rejects bad passwords and rotates refresh tokens, revoking on reuse", async () => {
    const s = await register();
    await request(app).post("/api/v1/auth/login").send({ email: "me@example.com", password: "wrong-password" }).expect(401);

    const r1 = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: s.refreshToken }).expect(200);
    // Re-using the old token is treated as theft: family is revoked.
    await request(app).post("/api/v1/auth/refresh").send({ refreshToken: s.refreshToken }).expect(401);
    await request(app).post("/api/v1/auth/refresh").send({ refreshToken: r1.body.refreshToken }).expect(401);
  });

  it("requires a token for data routes", async () => {
    await request(app).get("/api/v1/captures").expect(401);
  });
});

describe("captures", () => {
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  beforeEach(async () => {
    token = (await register()).accessToken;
  });

  it("creates, searches, filters and partially updates records", async () => {
    const hoa = await request(app)
      .post("/api/v1/captures")
      .set(auth())
      .send({
        type: "payment",
        title: "HOA dues September",
        counterparty: "Oak Grove HOA",
        amountMinor: 32500,
        occurredAt: "2026-09-01",
        property: "Oak Grove",
        category: "HOA",
        payment: { method: "ACH", confirmationNumber: "CNF-7781" },
      })
      .expect(201);
    expect(hoa.body.filed).toBe(true);

    await request(app).post("/api/v1/captures").set(auth()).send({ title: "Cool ramen place in Kyoto", tags: ["Food", "food"] }).expect(201);

    const search = await request(app).get("/api/v1/captures?q=oak%20grove").set(auth()).expect(200);
    expect(search.body.total).toBe(1);
    const byConf = await request(app).get("/api/v1/captures?q=cnf-7781").set(auth()).expect(200);
    expect(byConf.body.total).toBe(1);

    const inbox = await request(app).get("/api/v1/captures?filed=false").set(auth()).expect(200);
    expect(inbox.body.items[0].tags).toEqual(["food"]);

    const patched = await request(app)
      .patch(`/api/v1/captures/${hoa.body._id}`)
      .set(auth())
      .send({ payment: { confirmationNumber: "CNF-9999" }, notes: null })
      .expect(200);
    expect(patched.body.payment.method).toBe("ACH"); // merged, not replaced
    expect(patched.body.payment.confirmationNumber).toBe("CNF-9999");

    await request(app).delete(`/api/v1/captures/${hoa.body._id}`).set(auth()).expect(204);
    await request(app).get(`/api/v1/captures/${hoa.body._id}`).set(auth()).expect(404);
  });

  it("isolates workspaces", async () => {
    const mine = await request(app).post("/api/v1/captures").set(auth()).send({ title: "secret" }).expect(201);
    // Create a second user directly (signup is closed).
    const other = await User.create({ email: "x@example.com", name: "X", passwordHash: "x" });
    const ws = await Workspace.create({ name: "X", ownerId: other._id });
    await Membership.create({ workspaceId: ws._id, userId: other._id, role: "owner" });
    other.defaultWorkspaceId = ws._id;
    await other.save();
    const { signAccessToken } = await import("../src/lib/tokens.js");
    const otherToken = signAccessToken(other._id.toString());

    await request(app).get(`/api/v1/captures/${mine.body._id}`).set({ Authorization: `Bearer ${otherToken}` }).expect(404);
    const list = await request(app).get("/api/v1/captures").set({ Authorization: `Bearer ${otherToken}` }).expect(200);
    expect(list.body.total).toBe(0);
    // Cannot switch into a workspace they are not a member of.
    const me = await request(app).get("/api/v1/auth/me").set(auth()).expect(200);
    await request(app)
      .get("/api/v1/captures")
      .set({ Authorization: `Bearer ${otherToken}`, "X-Workspace-Id": me.body.user.defaultWorkspaceId })
      .expect(403);
  });

  it("uploads attachments with signature checks and streams them back", async () => {
    const cap = await request(app).post("/api/v1/captures").set(auth()).send({ title: "Receipt" }).expect(201);
    const up = await request(app)
      .post("/api/v1/attachments")
      .set(auth())
      .field("captureId", cap.body._id)
      .attach("files", PNG, { filename: "r.png", contentType: "image/png" })
      .expect(201);
    const att = up.body.items[0];
    expect(att.mimeType).toBe("image/png");

    const content = await request(app).get(`/api/v1/attachments/${att._id}/content`).set(auth()).expect(200);
    expect(Buffer.compare(content.body, PNG)).toBe(0);

    const detail = await request(app).get(`/api/v1/captures/${cap.body._id}`).set(auth()).expect(200);
    expect(detail.body.attachments).toHaveLength(1);

    await request(app)
      .post("/api/v1/attachments")
      .set(auth())
      .attach("files", Buffer.from("MZ fake exe"), { filename: "evil.png", contentType: "image/png" })
      .expect(400);
  });

  it("tracks reimbursements and deposits on the dashboard", async () => {
    await request(app)
      .post("/api/v1/captures")
      .set(auth())
      .send({
        type: "expense",
        title: "Diwali event supplies",
        amountMinor: 12000,
        expense: { reimbursable: true, reimbursement: { organization: "India Club", amountReimbursedMinor: 2000, status: "partial" } },
      })
      .expect(201);
    await request(app)
      .post("/api/v1/captures")
      .set(auth())
      .send({ type: "deposit", title: "Check from Sam", amountMinor: 5000, deposit: { checkNumber: "1042" } })
      .expect(201);

    const dash = await request(app).get("/api/v1/dashboard").set(auth()).expect(200);
    expect(dash.body.reimbursementsOwed[0]).toMatchObject({ organization: "India Club", outstandingMinor: 10000 });
    expect(dash.body.unclearedDeposits).toHaveLength(1);

    const groups = await request(app).get("/api/v1/reimbursements").set(auth()).expect(200);
    expect(groups.body.groups[0].outstandingMinor).toBe(10000);

    const csv = await request(app).get("/api/v1/reports/export.csv?type=expense").set(auth()).expect(200);
    expect(csv.text).toContain("India Club");
    expect(csv.text).toContain("120.00");
  });
});

describe("recurring payments", () => {
  it("marks paid, records history, advances the due date and sends reminders once", async () => {
    const { accessToken } = await register();
    const auth = { Authorization: `Bearer ${accessToken}` };
    const s = await request(app)
      .post("/api/v1/recurring")
      .set(auth)
      .send({
        title: "Oak Grove HOA",
        counterparty: "Oak Grove HOA",
        amountMinor: 32500,
        property: "Oak Grove",
        frequency: { unit: "month", interval: 1 },
        nextDueDate: "2026-01-31",
      })
      .expect(201);

    const r1 = await runReminders(new Date("2026-01-30T12:00:00Z"));
    expect(r1.created).toBe(1);
    const r2 = await runReminders(new Date("2026-01-30T13:00:00Z"));
    expect(r2.created).toBe(0);

    const paid = await request(app)
      .post(`/api/v1/recurring/${s.body._id}/pay`)
      .set(auth)
      .send({ paidAt: "2026-01-29", confirmationNumber: "ABC123" })
      .expect(201);
    expect(paid.body.payment.amountMinor).toBe(32500);
    expect(paid.body.schedule.nextDueDate.slice(0, 10)).toBe("2026-02-28");

    const detail = await request(app).get(`/api/v1/recurring/${s.body._id}`).set(auth).expect(200);
    expect(detail.body.history).toHaveLength(1);

    await request(app).post("/internal/jobs/reminders").expect(401);
    await request(app).post("/internal/jobs/reminders").set("x-cron-secret", "cron-secret").expect(200);
  });
});
