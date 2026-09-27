import type { Readable } from "node:stream";
import { GridFsStorage } from "./gridfs.js";

/**
 * Feature code only talks to this interface. MVP stores files in MongoDB GridFS
 * (no extra service to run). Swap to an S3-compatible driver (Cloudflare R2,
 * AWS S3) later by adding a driver and changing STORAGE_DRIVER; existing files
 * keep working because each Attachment records its own driver + key.
 */
export interface FileStorage {
  readonly driver: string;
  put(input: { buffer: Buffer; filename: string; mimeType: string; workspaceId: string }): Promise<string>;
  get(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

let instance: FileStorage | null = null;
const drivers = new Map<string, FileStorage>();

export function storage(): FileStorage {
  if (!instance) {
    instance = new GridFsStorage();
    drivers.set(instance.driver, instance);
  }
  return instance;
}

export function storageFor(driver: string): FileStorage {
  storage();
  const d = drivers.get(driver);
  if (!d) throw new Error(`Unknown storage driver: ${driver}`);
  return d;
}
