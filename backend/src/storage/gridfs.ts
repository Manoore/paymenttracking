import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";
import type { Readable } from "node:stream";
import type { FileStorage } from "./index.js";

export class GridFsStorage implements FileStorage {
  readonly driver = "gridfs";

  private bucket() {
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB not connected");
    return new GridFSBucket(db, { bucketName: "files" });
  }

  put({ buffer, filename, mimeType, workspaceId }: { buffer: Buffer; filename: string; mimeType: string; workspaceId: string }) {
    return new Promise<string>((resolve, reject) => {
      const upload = this.bucket().openUploadStream(filename, { metadata: { mimeType, workspaceId } });
      upload.once("error", reject);
      upload.once("finish", () => resolve(upload.id.toString()));
      upload.end(buffer);
    });
  }

  async get(key: string): Promise<Readable> {
    return this.bucket().openDownloadStream(new ObjectId(key));
  }

  async remove(key: string) {
    await this.bucket().delete(new ObjectId(key));
  }
}
