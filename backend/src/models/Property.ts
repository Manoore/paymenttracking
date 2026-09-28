import { Schema, model } from "mongoose";

/**
 * A home or property you track (e.g. "Oak Grove"). Records still refer to it by
 * name in their `property` field, so older records and free-typed names keep
 * working; this just lets you add one up front with an address and notes.
 */
const propertySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    // Lower-cased name for case-insensitive uniqueness and matching records.
    key: { type: String, required: true },
    address: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 5000 },
  },
  { timestamps: true },
);
propertySchema.index({ workspaceId: 1, key: 1 }, { unique: true });

export const Property = model("Property", propertySchema);
