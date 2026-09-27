import { Schema, model } from "mongoose";

const attachmentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    captureId: { type: Schema.Types.ObjectId, ref: "Capture", index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    // Storage is abstracted: `driver` + `key` let us move files (GridFS -> S3/R2) later.
    storage: {
      driver: { type: String, required: true },
      key: { type: String, required: true },
    },
    extractedText: { type: String, select: false },
    deletedAt: Date,
  },
  { timestamps: true },
);

export const Attachment = model("Attachment", attachmentSchema);
