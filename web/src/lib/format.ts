import type { CaptureType, ReimbursementStatus } from "./types";

export function formatMoney(minor?: number | null, currency = "USD") {
  if (minor === undefined || minor === null) return "";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

/** Parse "1,234.50" / "$12" into integer cents; returns undefined for blank or invalid input. */
export function parseMoney(input: string): number | undefined {
  const cleaned = input.replace(/[^\d.-]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

export function minorToInput(minor?: number | null) {
  return minor === undefined || minor === null ? "" : (minor / 100).toFixed(2);
}

/** Dates are stored as UTC midnight for "date only" fields; render them without timezone drift. */
export function formatDate(iso?: string | null, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", ...opts }).format(new Date(iso));
}

export function toDateInput(iso?: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function todayInput() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

export function daysUntil(iso: string) {
  const due = new Date(iso).getTime();
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86_400_000);
}

export function relativeDue(iso: string) {
  const d = daysUntil(iso);
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d} days`;
}

export const TYPE_LABELS: Record<CaptureType, string> = {
  note: "Note",
  link: "Link",
  payment: "Payment",
  expense: "Expense",
  deposit: "Check deposit",
  document: "Document",
  place: "Place",
  idea: "Idea",
};

export const DOC_KIND_LABELS = {
  warranty: "Warranty",
  insurance: "Insurance policy",
  passport: "Passport",
  license: "Driver's license",
  registration: "Vehicle registration",
  lease: "Lease",
  contract: "Contract",
  id: "ID card",
  other: "Other",
} as const;

/** Rough monthly cost of a schedule, for the subscriptions total. */
export function monthlyEquivalent(amountMinor: number | undefined, f: { unit: string; interval: number }) {
  if (!amountMinor) return 0;
  const perYear = f.unit === "week" ? 52 / f.interval : f.unit === "month" ? 12 / f.interval : 1 / f.interval;
  return Math.round((amountMinor * perYear) / 12);
}

export const STATUS_LABELS: Record<ReimbursementStatus, string> = {
  to_submit: "To submit",
  submitted: "Submitted",
  partial: "Partially reimbursed",
  reimbursed: "Reimbursed",
};

export function frequencyLabel(f: { unit: string; interval: number }) {
  if (f.interval === 1) return { week: "Weekly", month: "Monthly", year: "Yearly" }[f.unit] ?? f.unit;
  if (f.unit === "month" && f.interval === 3) return "Quarterly";
  if (f.unit === "month" && f.interval === 6) return "Every 6 months";
  return `Every ${f.interval} ${f.unit}s`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
