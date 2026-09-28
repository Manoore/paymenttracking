import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function household() {
  // Me: first account (signup then closes).
  const me = await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "me@example.com", password: "correct-horse-battery", name: "Manoore" })
    .expect(201);
  const meAuth = { Authorization: `Bearer ${me.body.accessToken}` };
  const personalId = me.body.user.defaultWorkspaceId as string;

  const fam = await request(app).post("/api/v1/workspaces").set(meAuth).send({ name: "Our home" }).expect(201);
  const famHeader = { ...meAuth, "X-Workspace-Id": fam.body.id as string };

  const inv = await request(app).post("/api/v1/workspaces/current/invites").set(famHeader).send({}).expect(201);
  const token = new URL(inv.body.url).pathname.split("/").pop()!;

  // Spouse signs up with the invite even though sign-up is closed.
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "spouse@example.com", password: "another-long-password", name: "Archna" })
    .expect(403);
  const sp = await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "spouse@example.com", password: "another-long-password", name: "Archna", inviteToken: token })
    .expect(201);
  expect(sp.body.user.defaultWorkspaceId).toBe(fam.body.id);
  const spAuth = { Authorization: `Bearer ${sp.body.accessToken}` }; // default workspace = family
  return { meAuth, famHeader, spAuth, personalId, famId: fam.body.id as string, token, spouseId: sp.body.user.id as string };
}

describe("family workspace", () => {
  it("invites are single-use and personal workspaces can't be shared", async () => {
    const { meAuth, token } = await household();
    await request(app).get(`/api/v1/invites/${token}`).expect(410);
    await request(app).post("/api/v1/workspaces/current/invites").set(meAuth).send({}).expect(400); // personal
  });

  it("shares bills, prevents double payment and records who paid", async () => {
    const { famHeader, spAuth, meAuth, spouseId } = await household();
    const bill = await request(app)
      .post("/api/v1/recurring")
      .set(famHeader)
      .send({ title: "Electricity", amountMinor: 14000, frequency: { unit: "month", interval: 1 }, nextDueDate: inDays(3) })
      .expect(201);

    // Spouse sees it and claims it; I can't claim it too.
    const list = await request(app).get("/api/v1/recurring").set(spAuth).expect(200);
    expect(list.body.items).toHaveLength(1);
    await request(app).post(`/api/v1/recurring/${bill.body._id}/claim`).set(spAuth).expect(200);
    const conflict = await request(app).post(`/api/v1/recurring/${bill.body._id}/claim`).set(famHeader).expect(409);
    expect(conflict.body.error.message).toContain("Archna");

    // Spouse pays; the claim clears and it's recorded as paid by her.
    const paid = await request(app).post(`/api/v1/recurring/${bill.body._id}/pay`).set(spAuth).send({}).expect(201);
    expect(paid.body.payment.paidBy).toBe(spouseId);
    expect(paid.body.schedule.claimedBy).toBeUndefined();

    // I record groceries I paid for.
    await request(app).post("/api/v1/captures").set(famHeader).send({ type: "expense", title: "Groceries", amountMinor: 6000 }).expect(201);

    const month = new Date().toISOString().slice(0, 7);
    const h = await request(app).get(`/api/v1/household?month=${month}`).set(famHeader).expect(200);
    const electricity = h.body.bills.find((b: { title: string }) => b.title === "Electricity");
    // Paid this month (unless "due in 3 days" crosses into next month, in which case the payment date still is this month).
    expect(electricity.status).toBe("paid");
    expect(electricity.paidByName).toBe("Archna");
    const byName = Object.fromEntries(h.body.paidByMember.map((m: { name: string; totalMinor: number }) => [m.name, m.totalMinor]));
    expect(byName).toEqual({ Archna: 14000, Manoore: 6000 });

    // My personal workspace stays private from the spouse.
    await request(app).post("/api/v1/captures").set(meAuth).send({ title: "Personal note" }).expect(201);
    const spView = await request(app).get("/api/v1/captures?q=Personal").set(spAuth).expect(200);
    expect(spView.body.total).toBe(0);
  });

  it("rejects paid-by for non-members, hides private items, and lets members leave", async () => {
    const { famHeader, spAuth, personalId } = await household();
    const me = await request(app).get("/api/v1/auth/me").set(famHeader).expect(200);
    await request(app)
      .post("/api/v1/captures")
      .set(spAuth)
      .send({ type: "payment", title: "Bad", amountMinor: 1, paidBy: personalId })
      .expect(400);
    await request(app)
      .post("/api/v1/captures")
      .set(spAuth)
      .send({ type: "payment", title: "Paid for her by me", amountMinor: 1, paidBy: me.body.user.id })
      .expect(201);
    await request(app).post("/api/v1/captures").set(famHeader).send({ title: "Surprise gift idea", visibility: "private" }).expect(201);
    expect((await request(app).get("/api/v1/captures?q=Surprise").set(spAuth)).body.total).toBe(0);

    const members = await request(app).get("/api/v1/workspaces/current/members").set(famHeader).expect(200);
    expect(members.body.members.map((m: { name: string }) => m.name).sort()).toEqual(["Archna", "Manoore"]);
    await request(app).delete("/api/v1/workspaces/current/members/me").set(famHeader).expect(400); // owner can't leave
    await request(app).delete("/api/v1/workspaces/current/members/me").set(spAuth).expect(204);
  });

  it("viewers can look but not change anything", async () => {
    const { famHeader } = await household();
    const inv = await request(app).post("/api/v1/workspaces/current/invites").set(famHeader).send({ role: "viewer" }).expect(201);
    const token = new URL(inv.body.url).pathname.split("/").pop()!;
    const v = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "kid@example.com", password: "a-long-password-1", name: "Kid", inviteToken: token })
      .expect(201);
    const vAuth = { Authorization: `Bearer ${v.body.accessToken}` };
    await request(app).get("/api/v1/captures").set(vAuth).expect(200);
    await request(app).post("/api/v1/captures").set(vAuth).send({ title: "nope" }).expect(403);
  });
});
