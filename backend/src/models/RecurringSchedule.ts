import { Schema, model } from "mongoose";

const recurringScheduleSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    counterparty: String,
    amountMinor: Number, // expected amount; actual paid amount lives on each payment
    currency: { type: String, default: "USD" },
    category: String,
    property: String,
    method: String,
    notes: String,
    frequency: {
      unit: { type: String, enum: ["week", "month", "year"], required: true },
      interval: { type: Number, default: 1, min: 1 },
    },
    anchorDay: { type: Number, min: 1, max: 31 },
    nextDueDate: { type: Date, required: true },
    reminderDaysBefore: { type: Number, default: 3, min: 0, max: 60 },
    lastRemindedFor: Date, // due date we last sent a reminder for (dedupe)
    lastPaidAt: Date,
    lastPaidBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastPaymentId: { type: Schema.Types.ObjectId, ref: "Capture" },
    // "I'm paying this": stops a spouse/partner paying the same bill twice.
    claimedBy: { type: Schema.Types.ObjectId, ref: "User" },
    claimedAt: Date,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
recurringScheduleSchema.index({ workspaceId: 1, active: 1, nextDueDate: 1 });

export const RecurringSchedule = model("RecurringSchedule", recurringScheduleSchema);

const notificationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["due_soon", "overdue", "expiring", "return", "warranty"], required: true },
    title: { type: String, required: true },
    body: String,
    scheduleId: { type: Schema.Types.ObjectId, ref: "RecurringSchedule" },
    captureId: { type: Schema.Types.ObjectId, ref: "Capture" },
    readAt: Date,
  },
  { timestamps: true },
);
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export const Notification = model("Notification", notificationSchema);
