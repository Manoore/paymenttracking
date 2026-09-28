import { Schema, model, type InferSchemaType, type Types } from "mongoose";

/**
 * Every saved thing is a Capture. Common "who / what / when / where / how much"
 * fields live at the top level so one search and filter model works across all
 * types. Type-specific details live in an optional sub-document per module
 * (payment, expense, deposit, ...). Future modules (place, product, design)
 * add a new sub-document and a new `type` value; nothing else changes.
 */
export const CAPTURE_TYPES = ["note", "link", "payment", "expense", "deposit", "document", "place", "idea"] as const;
export type CaptureType = (typeof CAPTURE_TYPES)[number];

export const REIMBURSEMENT_STATUSES = ["to_submit", "submitted", "partial", "reimbursed"] as const;

const paymentSchema = new Schema(
  {
    method: String, // e.g. "ACH", "Credit card", "Zelle"
    confirmationNumber: String,
    scheduleId: { type: Schema.Types.ObjectId, ref: "RecurringSchedule" },
    dueDate: Date,
  },
  { _id: false },
);

const reimbursementSchema = new Schema(
  {
    organization: String,
    status: { type: String, enum: REIMBURSEMENT_STATUSES, default: "to_submit" },
    submittedAt: Date,
    // What you're owed back; defaults to the full amount. Lower it for splits ("Ravi owes $30 of $90").
    amountOwedMinor: Number,
    amountReimbursedMinor: { type: Number, default: 0 },
    reimbursedAt: Date,
    notes: String,
  },
  { _id: false },
);

const expenseSchema = new Schema(
  {
    project: String,
    paymentMethod: String,
    reimbursable: { type: Boolean, default: false },
    reimbursement: reimbursementSchema,
  },
  { _id: false },
);

const depositSchema = new Schema(
  {
    checkNumber: String,
    bankAccount: String,
    cleared: { type: Boolean, default: false },
    clearedAt: Date,
  },
  { _id: false },
);

export const DOCUMENT_KINDS = ["warranty", "insurance", "passport", "license", "registration", "lease", "contract", "id", "other"] as const;

/** Important papers with an expiry/renewal date (passport, insurance policy, lease…). */
const documentSchema = new Schema(
  {
    kind: { type: String, enum: DOCUMENT_KINDS, default: "other" },
    // Store only a reference like the last 4 digits, never full ID numbers.
    reference: String,
    expiresAt: Date,
  },
  { _id: false },
);

/** Travel spots, restaurants and other places worth remembering. */
const placeSchema = new Schema(
  {
    kind: { type: String, enum: ["restaurant", "stay", "sight", "shop", "other"], default: "other" },
    address: String,
    mapUrl: String,
    visited: { type: Boolean, default: false },
    rating: { type: Number, min: 1, max: 5 },
  },
  { _id: false },
);

/** Products to buy, design inspiration and other ideas. */
const ideaSchema = new Schema(
  {
    kind: { type: String, enum: ["product", "design", "gift", "other"], default: "other" },
    status: { type: String, enum: ["want", "done", "dropped"], default: "want" },
  },
  { _id: false },
);

const linkSchema = new Schema(
  {
    captureId: { type: Schema.Types.ObjectId, ref: "Capture", required: true },
    relation: { type: String, default: "related" },
  },
  { _id: false },
);

const captureSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // "workspace" = visible to all workspace members; "private" = creator only.
    visibility: { type: String, enum: ["workspace", "private"], default: "workspace" },

    type: { type: String, enum: CAPTURE_TYPES, required: true, default: "note" },
    // Unfiled captures form the Inbox; filing = deciding what the capture is.
    filed: { type: Boolean, default: false },

    title: { type: String, required: true, trim: true, maxlength: 300 },
    notes: { type: String, maxlength: 20000 },
    tags: { type: [String], default: [] },
    category: String,
    url: String,
    source: { type: String, enum: ["manual", "upload", "camera", "share", "web", "import"], default: "manual" },

    // Common structured fields.
    counterparty: String, // payee, merchant or payer
    amountMinor: Number, // integer cents; never floats for money
    currency: { type: String, default: "USD" },
    occurredAt: Date, // paid / spent / deposited / captured date
    property: String,
    trip: String,
    // Who this relates to / is on behalf of (e.g. "India Club", "Work"). For
    // reimbursable expenses it is also who pays you back.
    organization: String,

    // Purchase follow-ups (any type): reminders fire before these dates.
    returnBy: Date,
    warrantyUntil: Date,
    reminderDaysBefore: { type: Number, min: 0, max: 120 },
    // Keys like "return:2026-10-01" so each deadline notifies once.
    remindedFor: { type: [String], default: undefined, select: false },

    payment: paymentSchema,
    expense: expenseSchema,
    deposit: depositSchema,
    document: documentSchema,
    place: placeSchema,
    idea: ideaSchema,

    attachmentIds: [{ type: Schema.Types.ObjectId, ref: "Attachment" }],
    links: { type: [linkSchema], default: [] },
    extractedText: { type: String, select: false },

    deletedAt: Date,
  },
  { timestamps: true },
);

captureSchema.index({ workspaceId: 1, deletedAt: 1, occurredAt: -1 });
captureSchema.index({ workspaceId: 1, type: 1, occurredAt: -1 });
captureSchema.index({ workspaceId: 1, filed: 1 });
captureSchema.index({ workspaceId: 1, "expense.reimbursable": 1, "expense.reimbursement.status": 1 });
captureSchema.index({ workspaceId: 1, tags: 1 });
captureSchema.index({ workspaceId: 1, organization: 1 });
captureSchema.index({ workspaceId: 1, "document.expiresAt": 1 });
captureSchema.index({ workspaceId: 1, returnBy: 1 });
captureSchema.index({ workspaceId: 1, warrantyUntil: 1 });
captureSchema.index(
  {
    title: "text",
    notes: "text",
    tags: "text",
    counterparty: "text",
    property: "text",
    trip: "text",
    organization: "text",
    category: "text",
    extractedText: "text",
  },
  { name: "capture_text", weights: { title: 10, counterparty: 8, tags: 6, property: 5, trip: 5, notes: 3 } },
);

export type CaptureDoc = InferSchemaType<typeof captureSchema> & { _id: Types.ObjectId };
export const Capture = model("Capture", captureSchema);
