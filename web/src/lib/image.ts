"use client";

const MAX_DIMENSION = 2400;
const COMPRESS_OVER_BYTES = 1.5 * 1024 * 1024;

/**
 * Phone photos are often 4-12 MB. Downscale large JPEG/PNG/WebP images in the
 * browser before upload; screenshots and receipts stay perfectly legible at
 * 2400px. Formats the browser cannot decode (e.g. HEIC outside Safari) are sent as-is.
 */
export async function prepareForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < COMPRESS_OVER_BYTES || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
