import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { runReminders } from "../src/jobs/reminders.js";
import { Notification } from "../src/models/RecurringSchedule.js";

const app = createApp();

async function session() {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "me@example.com", password: "correct-horse-battery", name: "Me" })
    .expect(201);
  const auth = { Authorization: `Bearer ${res.body.accessToken}` };
  const post = (body: object) => request(app).post("/api/v1/captures").set(auth).send(body).expect(201);
  return { auth, post };
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("templates, trash and spelling", () => {
  it("offers the most frequent combinations as templates", async () => {
    const { auth, post } = await session();
    for (let i = 0; i < 3; i++) await post({ type: "payment", title: "HOA", counterparty: "Oak Grove HOA", amountMinor: 32500, property: "Oak Grove" });
    await post({ type: "expense", title: "Groceries", counterparty: "Costco", amountMinor: 8000 });
    const t = await request(app).get("/api/v1/captures/templates").set(auth).expect(200);
    expect(t.body.items[0]).toMatchObject({ count: 3, label: "To Oak Grove HOA", values: { property: "Oak Grove", amountMinor: 32500 } });
  });

  it("moves deleted records to trash, restores and deletes forever", async () => {
    const { auth, post } = await session();
    const c = await post({ title: "Old note" });
    await request(app).delete(`/api/v1/captures/${c.body._id}`).set(auth).expect(204);
    const trash = await request(app).get("/api/v1/captures/trash").set(auth).expect(200);
    expect(trash.body.items).toHaveLength(1);
    await request(app).post(`/api/v1/captures/${c.body._id}/restore`).set(auth).expect(200);
    await request(app).delete(`/api/v1/captures/${c.body._id}`).set(auth).expect(204);
    await request(app).delete(`/api/v1/captures/${c.body._id}/permanent`).set(auth).expect(204);
    expect((await request(app).get("/api/v1/captures/trash").set(auth)).body.items).toHaveLength(0);
  });

  it("suggests a spelling when search finds nothing", async () => {
    const { auth, post } = await session();
    await post({ type: "expense", title: "Supplies", counterparty: "Costco", amountMinor: 100 });
    const r = await request(app).get("/api/v1/captures?q=costko").set(auth).expect(200);
    expect(r.body.total).toBe(0);
    expect(r.body.didYouMean).toBe("Costco");
  });
});

describe("documents, returns, warranties", () => {
  it("shows expiring items on the dashboard and reminds once", async () => {
    const { auth, post } = await session();
    await post({ type: "document", title: "Passport", document: { kind: "passport", reference: "…4821", expiresAt: inDays(20) } });
    await post({ type: "expense", title: "Headphones", amountMinor: 19900, returnBy: inDays(2), warrantyUntil: inDays(365) });
    const d = await request(app).get("/api/v1/dashboard").set(auth).expect(200);
    expect(d.body.expiring.map((e: { kind: string }) => e.kind).sort()).toEqual(["expires", "return"]);

    const r1 = await runReminders();
    expect(r1.created).toBe(2); // passport (30-day window) + return (3-day window); warranty not yet due
    const r2 = await runReminders();
    expect(r2.created).toBe(0);
    expect(await Notification.countDocuments({ kind: { $in: ["expiring", "return"] } })).toBe(2);
  });
});

describe("splits and properties", () => {
  it("uses the owed amount for split expenses", async () => {
    const { auth, post } = await session();
    await post({
      type: "expense",
      title: "Dinner",
      amountMinor: 9000,
      organization: "Ravi",
      expense: { reimbursable: true, reimbursement: { amountOwedMinor: 3000 } },
    });
    const g = await request(app).get("/api/v1/reimbursements").set(auth).expect(200);
    expect(g.body.groups[0]).toMatchObject({ key: "Ravi", outstandingMinor: 3000 });
  });

  it("lists properties with totals and schedules", async () => {
    const { auth, post } = await session();
    await post({ type: "payment", title: "HOA", amountMinor: 32500, property: "Oak Grove" });
    await post({ type: "expense", title: "Plumber", amountMinor: 20000, property: "oak grove" });
    await request(app)
      .post("/api/v1/recurring")
      .set(auth)
      .send({ title: "HOA dues", property: "Oak Grove", frequency: { unit: "month", interval: 1 }, nextDueDate: inDays(5) })
      .expect(201);
    const p = await request(app).get("/api/v1/properties").set(auth).expect(200);
    expect(p.body.items).toHaveLength(1);
    expect(p.body.items[0]).toMatchObject({ count: 2, schedules: 1, totals: [{ currency: "USD", totalMinor: 52500 }] });
  });
});

describe("calendar feed", () => {
  it("serves an iCalendar feed behind a private token", async () => {
    const { auth, post } = await session();
    await request(app)
      .post("/api/v1/recurring")
      .set(auth)
      .send({ title: "Insurance", amountMinor: 118400, frequency: { unit: "year", interval: 1 }, nextDueDate: inDays(10) })
      .expect(201);
    await post({ type: "document", title: "Car registration", document: { expiresAt: inDays(40) } });
    const { body } = await request(app).post("/api/v1/calendar/feed").set(auth).expect(200);
    const path = new URL(body.url).pathname;
    const ics = await request(app).get(path).expect(200);
    expect(ics.headers["content-type"]).toContain("text/calendar");
    expect(ics.text).toContain("SUMMARY:Due: Insurance (USD 1184.00)");
    expect(ics.text).toContain("SUMMARY:Expires: Car registration");
    // Rotating the token revokes the old URL.
    await request(app).post("/api/v1/calendar/feed?rotate=1").set(auth).expect(200);
    await request(app).get(path).expect(404);
  });
});

describe("saved properties", () => {
  it("adds, merges with record names, renames everywhere and suggests", async () => {
    const { auth, post } = await session();
    const created = await request(app)
      .post("/api/v1/properties")
      .set(auth)
      .send({ name: "Oak Grove (Unit 2)", address: "12 Oak Grove Ct, San Jose" })
      .expect(201);
    await request(app).post("/api/v1/properties").set(auth).send({ name: "oak grove (unit 2)" }).expect(409);
    await post({ type: "payment", title: "HOA", amountMinor: 32500, property: "oak grove (unit 2)" });

    let list = await request(app).get("/api/v1/properties").set(auth).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ name: "Oak Grove (Unit 2)", address: "12 Oak Grove Ct, San Jose", count: 1 });

    await request(app).patch(`/api/v1/properties/${created.body.id}`).set(auth).send({ name: "Oak Grove Home" }).expect(200);
    const renamed = await request(app).get("/api/v1/captures?property=Oak%20Grove%20Home").set(auth).expect(200);
    expect(renamed.body.total).toBe(1);

    const sugg = await request(app).get("/api/v1/suggestions?field=property").set(auth).expect(200);
    expect(sugg.body.values).toEqual(["Oak Grove Home"]);

    await request(app).delete(`/api/v1/properties/${created.body.id}`).set(auth).expect(204);
    list = await request(app).get("/api/v1/properties").set(auth).expect(200);
    expect(list.body.items[0]).toMatchObject({ name: "Oak Grove Home", count: 1 }); // records keep the name
    expect(list.body.items[0].id).toBeUndefined();
  });
});

describe("thumbnails in lists", () => {
  it("adds a signed thumbnail URL for records whose first attachment is an image", async () => {
    const { auth, post } = await session();
    const PNG = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d50000000049454e44ae426082",
      "hex",
    );
    const place = await post({ type: "place", title: "Paradise Biryani", place: { kind: "restaurant", address: "Fremont, CA" } });
    await request(app).post("/api/v1/attachments").set(auth).field("captureId", place.body._id).attach("files", PNG, { filename: "p.png", contentType: "image/png" }).expect(201);
    await post({ type: "idea", title: "Standing desk", idea: { kind: "product" } });
    const r = await request(app).get("/api/v1/captures?type=place,idea&thumbs=1").set(auth).expect(200);
    const byTitle = Object.fromEntries(r.body.items.map((i: { title: string; thumbUrl: string | null }) => [i.title, i.thumbUrl]));
    expect(byTitle["Paradise Biryani"]).toMatch(/^\/files\/.+\?sig=/);
    expect(byTitle["Standing desk"]).toBeNull();
    await request(app).get(byTitle["Paradise Biryani"]).expect(200);
  });
});
