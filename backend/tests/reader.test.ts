import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { decryptSecret } from "../src/lib/secrets.js";
import { Workspace } from "../src/models/identity.js";

const app = createApp();
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d50000000049454e44ae426082",
  "hex",
);
const PNG2 = Buffer.concat([PNG, Buffer.from("different")]);
const FAKE_KEY = "sk-test-0123456789abcdef";

const extraction = {
  documentType: "payment_confirmation",
  suggestedType: "payment",
  title: "HOA dues – October",
  counterparty: "Oak Grove HOA",
  amount: 325,
  currency: "usd",
  date: "2026-10-01",
  dueDate: null,
  expiresAt: null,
  confirmationNumber: "CNF-7781",
  checkNumber: null,
  category: "HOA",
  documentKind: null,
  confidence: "high",
  fullText: "Payment confirmation Oak Grove HOA $325.00 Confirmation CNF-7781 zebrafinch",
};

/** Routes provider HTTP calls to canned answers; supertest's own localhost traffic passes through. */
function mockProviders() {
  const realFetch = globalThis.fetch;
  const calls: { url: string; body: unknown }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!/openai\.com|anthropic\.com|googleapis\.com|openrouter/.test(url)) return realFetch(input, init);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/models/")) return json({ id: "ok" });
    if (url.includes("/chat/completions")) return json({ choices: [{ message: { content: JSON.stringify(extraction) } }] });
    if (url.includes("anthropic.com") && url.includes("/messages"))
      return json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text: JSON.stringify(extraction) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    return json({ error: { message: "unexpected" } }, 500);
  });
  return calls;
}

async function owner() {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "me@example.com", password: "correct-horse-battery", name: "Me" })
    .expect(201);
  return { Authorization: `Bearer ${res.body.accessToken}` };
}

afterEach(() => vi.restoreAllMocks());

describe("document reading settings", () => {
  it("stores the key encrypted, never returns it, and tests it", async () => {
    const auth = await owner();
    const calls = mockProviders();
    expect((await request(app).get("/api/v1/workspaces/current/reader").set(auth).expect(200)).body.configured).toBe(false);

    await request(app).put("/api/v1/workspaces/current/reader").set(auth).send({ provider: "openai" }).expect(400); // key required
    const saved = await request(app)
      .put("/api/v1/workspaces/current/reader")
      .set(auth)
      .send({ provider: "openai", apiKey: FAKE_KEY })
      .expect(200);
    expect(saved.body).toMatchObject({ configured: true, provider: "openai", model: "gpt-5-mini", keyHint: "sk-…cdef" });
    expect(JSON.stringify(saved.body)).not.toContain(FAKE_KEY);

    const ws = await Workspace.findOne({}).select("+ai.apiKeyEnc");
    expect(ws?.ai?.apiKeyEnc).not.toContain(FAKE_KEY);
    expect(decryptSecret(ws!.ai!.apiKeyEnc!)).toBe(FAKE_KEY);

    const t = await request(app).post("/api/v1/workspaces/current/reader/test").set(auth).send({}).expect(200);
    expect(t.body.ok).toBe(true);
    expect(calls.at(-1)?.url).toBe("https://api.openai.com/v1/models/gpt-5-mini");

    // Switching provider needs that provider's key; custom URLs must be public https.
    await request(app).put("/api/v1/workspaces/current/reader").set(auth).send({ provider: "anthropic" }).expect(400);
    await request(app)
      .put("/api/v1/workspaces/current/reader")
      .set(auth)
      .send({ provider: "openai_compatible", apiKey: FAKE_KEY, model: "x", baseUrl: "http://169.254.169.254/v1" })
      .expect(400);
    await request(app)
      .put("/api/v1/workspaces/current/reader")
      .set(auth)
      .send({ provider: "openai_compatible", apiKey: FAKE_KEY, model: "meta/llama", baseUrl: "https://openrouter.ai/api/v1/" })
      .expect(200);

    await request(app).delete("/api/v1/workspaces/current/reader").set(auth).expect(204);
    expect((await request(app).get("/api/v1/workspaces/current/reader").set(auth)).body.configured).toBe(false);
  });
});

describe("reading files", () => {
  it("extracts fields, caches by file, applies on upload and makes text searchable", async () => {
    const auth = await owner();
    const calls = mockProviders();
    await request(app)
      .post("/api/v1/reader/extract")
      .set(auth)
      .attach("file", PNG, { filename: "r.png", contentType: "image/png" })
      .expect(409); // not set up yet
    await request(app).put("/api/v1/workspaces/current/reader").set(auth).send({ provider: "openai", apiKey: FAKE_KEY }).expect(200);

    const r1 = await request(app).post("/api/v1/reader/extract").set(auth).attach("file", PNG, { filename: "r.png", contentType: "image/png" }).expect(200);
    expect(r1.body.cached).toBe(false);
    expect(r1.body.fields).toMatchObject({ counterparty: "Oak Grove HOA", amount: 325, currency: "USD", date: "2026-10-01", suggestedType: "payment" });
    const sent = calls.find((c) => c.url.endsWith("/chat/completions"))!.body as { model: string; messages: { content: unknown }[] };
    expect(sent.model).toBe("gpt-5-mini");
    expect(JSON.stringify(sent.messages[1].content)).toContain("data:image/png;base64,");

    const r2 = await request(app).post("/api/v1/reader/extract").set(auth).attach("file", PNG, { filename: "r.png", contentType: "image/png" }).expect(200);
    expect(r2.body.cached).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/chat/completions"))).toHaveLength(1);

    // Save the record, then upload the same file: the cached reading is attached and searchable.
    const cap = await request(app).post("/api/v1/captures").set(auth).send({ type: "payment", title: "HOA", amountMinor: 32500 }).expect(201);
    await request(app).post("/api/v1/attachments").set(auth).field("captureId", cap.body._id).attach("files", PNG, { filename: "r.png", contentType: "image/png" }).expect(201);
    const found = await request(app).get("/api/v1/captures?q=zebrafinch").set(auth).expect(200);
    expect(found.body.total).toBe(1);

    const settings = await request(app).get("/api/v1/workspaces/current/reader").set(auth).expect(200);
    expect(settings.body.usedThisMonth).toBe(1);
  });

  it("enforces the monthly limit and rejects unreadable formats", async () => {
    const auth = await owner();
    mockProviders();
    await request(app).put("/api/v1/workspaces/current/reader").set(auth).send({ provider: "openai", apiKey: FAKE_KEY, monthlyLimit: 1 }).expect(200);
    await request(app).post("/api/v1/reader/extract").set(auth).attach("file", PNG, { filename: "a.png", contentType: "image/png" }).expect(200);
    const over = await request(app).post("/api/v1/reader/extract").set(auth).attach("file", PNG2, { filename: "b.png", contentType: "image/png" }).expect(429);
    expect(over.body.error.code).toBe("reader_limit");
    await request(app)
      .post("/api/v1/reader/extract")
      .set(auth)
      .attach("file", Buffer.from("not an image"), { filename: "x.txt", contentType: "text/plain" })
      .expect(415);
  });

  it("reads an existing attachment with Claude, with server-side fallbacks on Opus", async () => {
    const auth = await owner();
    const calls = mockProviders();
    await request(app).put("/api/v1/workspaces/current/reader").set(auth).send({ provider: "anthropic", apiKey: "sk-ant-test-0123456789" }).expect(200);
    const cap = await request(app).post("/api/v1/captures").set(auth).send({ title: "Receipt" }).expect(201);
    const up = await request(app)
      .post("/api/v1/attachments")
      .set(auth)
      .field("captureId", cap.body._id)
      .attach("files", PNG2, { filename: "r.png", contentType: "image/png" })
      .expect(201);
    const read = await request(app).post(`/api/v1/attachments/${up.body.items[0]._id}/read`).set(auth).expect(200);
    expect(read.body).toMatchObject({ provider: "anthropic", model: "claude-opus-5", fields: { confirmationNumber: "CNF-7781" } });
    const req = calls.find((c) => c.url.includes("/messages"))!.body as Record<string, unknown>;
    expect(req.fallbacks).toBe("default");
    expect(req.output_config).toMatchObject({ format: { type: "json_schema" } });
    expect((await request(app).get("/api/v1/captures?q=zebrafinch").set(auth)).body.total).toBe(1);
  });
});
