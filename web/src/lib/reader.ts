"use client";

import { api } from "./api";
import { prepareForUpload } from "./image";

export type ProviderId = "openai" | "anthropic" | "gemini" | "openai_compatible";

export interface ReaderSettings {
  configured: boolean;
  provider: ProviderId | null;
  providerLabel: string | null;
  model: string | null;
  baseUrl: string | null;
  keyHint: string | null;
  autoRead: boolean;
  monthlyLimit: number;
  usedThisMonth: number;
  canManage: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
  models: string[];
  needsBaseUrl?: boolean;
  keyHint: string;
}

export interface Extraction {
  documentType: string;
  suggestedType: "payment" | "expense" | "deposit" | "document" | "note";
  title: string | null;
  counterparty: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  dueDate: string | null;
  expiresAt: string | null;
  confirmationNumber: string | null;
  checkNumber: string | null;
  category: string | null;
  documentKind: string | null;
  confidence: "low" | "medium" | "high";
  fullText: string;
}

export interface ReadResult {
  fields: Extraction;
  provider: string;
  model: string;
  cached: boolean;
}

const READABLE = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;
export const isReadable = (f: { type?: string; mimeType?: string }) => READABLE.test(f.type ?? f.mimeType ?? "");

/** Read a not-yet-saved file. Pass the same (already prepared) File you will upload so the result is reused. */
export async function readFile(file: File) {
  const form = new FormData();
  form.append("file", await prepareForUpload(file));
  return api.upload<ReadResult>("/reader/extract", form);
}

export const readAttachment = (id: string) => api.post<ReadResult>(`/attachments/${id}/read`);
