/**
 * Document reading: one interface, many AI providers. Each provider receives a
 * file (photo, screenshot or PDF) and returns the same Extraction shape, so
 * screens never care which provider did the reading.
 */

export const PROVIDERS = ["openai", "anthropic", "gemini", "openai_compatible"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const DOCUMENT_TYPES = [
  "receipt",
  "invoice",
  "bill",
  "payment_confirmation",
  "check",
  "bank_statement",
  "id_document",
  "insurance",
  "warranty",
  "contract",
  "other",
] as const;

export const SUGGESTED_TYPES = ["payment", "expense", "deposit", "document", "note"] as const;
export const DOC_KINDS = ["warranty", "insurance", "passport", "license", "registration", "lease", "contract", "id", "other"] as const;

export interface Extraction {
  documentType: (typeof DOCUMENT_TYPES)[number];
  suggestedType: (typeof SUGGESTED_TYPES)[number];
  title: string | null;
  counterparty: string | null;
  amount: number | null; // major units, e.g. 32.50
  currency: string | null;
  date: string | null; // YYYY-MM-DD
  dueDate: string | null;
  expiresAt: string | null;
  confirmationNumber: string | null;
  checkNumber: string | null;
  category: string | null;
  documentKind: (typeof DOC_KINDS)[number] | null;
  confidence: "low" | "medium" | "high";
  fullText: string;
}

export interface ReadInput {
  bytes: Buffer;
  mimeType: string; // image/jpeg, image/png, image/webp, image/gif, application/pdf
  filename: string;
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string; // openai_compatible only
}

export interface DocumentReader {
  read(cfg: ProviderConfig, input: ReadInput): Promise<Extraction>;
  /** Cheap call that proves the key works and the model exists. */
  test(cfg: ProviderConfig): Promise<void>;
}

/** Friendly error surfaced to the user (bad key, unknown model, provider down…). */
export class ReaderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, "null"], ...extra });
const nullableEnum = (values: readonly string[]) => ({ type: ["string", "null"], enum: [...values, null] });

/** JSON Schema used by OpenAI and Claude structured outputs (every field required; nulls for unknown). */
export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentType",
    "suggestedType",
    "title",
    "counterparty",
    "amount",
    "currency",
    "date",
    "dueDate",
    "expiresAt",
    "confirmationNumber",
    "checkNumber",
    "category",
    "documentKind",
    "confidence",
    "fullText",
  ],
  properties: {
    documentType: { type: "string", enum: [...DOCUMENT_TYPES] },
    suggestedType: { type: "string", enum: [...SUGGESTED_TYPES] },
    title: nullable("string", { description: "Short title, e.g. 'HOA dues – September' or 'Costco groceries'" }),
    counterparty: nullable("string", { description: "Who was paid (payee/merchant) or, for a check or deposit, who paid" }),
    amount: nullable("number", { description: "Total paid or received, in major units (32.50), no currency symbol" }),
    currency: nullable("string", { description: "ISO 4217 code such as USD or INR" }),
    date: nullable("string", { description: "Transaction/payment/document date as YYYY-MM-DD" }),
    dueDate: nullable("string", { description: "Due date for bills as YYYY-MM-DD" }),
    expiresAt: nullable("string", { description: "Expiry/renewal date for IDs, policies, warranties as YYYY-MM-DD" }),
    confirmationNumber: nullable("string", { description: "Confirmation, reference, transaction or order number" }),
    checkNumber: nullable("string"),
    category: nullable("string", { description: "One or two words, e.g. HOA, Utilities, Groceries, Travel, Insurance" }),
    documentKind: nullableEnum(DOC_KINDS),
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    fullText: { type: "string", description: "All legible text in reading order (max ~4000 characters)" },
  },
} as const;

export const EXTRACTION_PROMPT = `You read personal finance documents and other saved items: payment confirmations, receipts, invoices, utility/HOA bills, checks, bank screenshots, and documents such as passports, insurance policies, warranties and leases.

Extract the fields in the schema from the attached file.
- Use null for anything not clearly present. Never guess amounts, dates or numbers.
- amount is the final total actually paid or received (after tax/tips), as a plain number.
- Dates must be YYYY-MM-DD. If the year is missing, use the most likely recent year.
- suggestedType: "payment" for a bill paid / payment confirmation, "expense" for a purchase receipt, "deposit" for a check or incoming money, "document" for IDs, policies, warranties, contracts, otherwise "note".
- documentKind only when suggestedType is "document".
- For ID documents, include only the last 4 characters of any ID number in fullText and confirmationNumber; mask the rest.
- confidence reflects how legible and unambiguous the key fields are.`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Defensive clean-up of whatever the provider returned. */
export function normalizeExtraction(raw: unknown): Extraction {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const date = (v: unknown) => {
    const s = str(v, 10);
    return s && ISO_DATE.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
  };
  const pick = <T extends readonly string[]>(v: unknown, values: T, fallback: T[number] | null) =>
    (typeof v === "string" && (values as readonly string[]).includes(v) ? v : fallback) as T[number];
  const amount = typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount >= 0 ? Math.round(r.amount * 100) / 100 : null;
  const currency = str(r.currency, 3)?.toUpperCase() ?? null;
  return {
    documentType: pick(r.documentType, DOCUMENT_TYPES, "other"),
    suggestedType: pick(r.suggestedType, SUGGESTED_TYPES, "note"),
    title: str(r.title, 200),
    counterparty: str(r.counterparty, 200),
    amount,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    date: date(r.date),
    dueDate: date(r.dueDate),
    expiresAt: date(r.expiresAt),
    confirmationNumber: str(r.confirmationNumber, 200),
    checkNumber: str(r.checkNumber, 50),
    category: str(r.category, 100),
    documentKind: r.documentKind == null ? null : pick(r.documentKind, DOC_KINDS, "other"),
    confidence: pick(r.confidence, ["low", "medium", "high"] as const, "low"),
    fullText: typeof r.fullText === "string" ? r.fullText.slice(0, 20_000) : "",
  };
}
