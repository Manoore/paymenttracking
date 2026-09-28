import { Schema, model } from "mongoose";

/**
 * Results of reading a file with an AI provider, keyed by the file's SHA-256 so
 * the same receipt is never sent (or paid for) twice within a workspace, even
 * when it is read before the record is saved and uploaded afterwards.
 */
const readCacheSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    sha256: { type: String, required: true },
    provider: String,
    model: String,
    fields: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);
readCacheSchema.index({ workspaceId: 1, sha256: 1 }, { unique: true });
// Keep a year of cached readings.
readCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 86_400 });

export const ReadCache = model("ReadCache", readCacheSchema);
