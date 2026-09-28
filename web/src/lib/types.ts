export type CaptureType = "note" | "link" | "payment" | "expense" | "deposit" | "document" | "place" | "idea";
export type DocumentKind = "warranty" | "insurance" | "passport" | "license" | "registration" | "lease" | "contract" | "id" | "other";
export type ReimbursementStatus = "to_submit" | "submitted" | "partial" | "reimbursed";

export interface Attachment {
  _id: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
  createdAt: string;
}

export interface Reimbursement {
  organization?: string;
  status?: ReimbursementStatus;
  submittedAt?: string;
  amountOwedMinor?: number;
  amountReimbursedMinor?: number;
  reimbursedAt?: string;
  notes?: string;
}

export interface Capture {
  _id: string;
  type: CaptureType;
  filed: boolean;
  visibility: "workspace" | "private";
  title: string;
  notes?: string;
  tags: string[];
  category?: string;
  url?: string;
  source: string;
  counterparty?: string;
  amountMinor?: number;
  currency: string;
  occurredAt?: string;
  property?: string;
  trip?: string;
  organization?: string;
  paidBy?: string;
  createdBy?: string;
  returnBy?: string;
  warrantyUntil?: string;
  reminderDaysBefore?: number;
  document?: { kind?: DocumentKind; reference?: string; expiresAt?: string };
  place?: { kind?: "restaurant" | "stay" | "sight" | "shop" | "other"; address?: string; mapUrl?: string; visited?: boolean; rating?: number };
  idea?: { kind?: "product" | "design" | "gift" | "other"; status?: "want" | "done" | "dropped" };
  payment?: { method?: string; confirmationNumber?: string; scheduleId?: string; dueDate?: string };
  expense?: { project?: string; paymentMethod?: string; reimbursable?: boolean; reimbursement?: Reimbursement };
  deposit?: { checkNumber?: string; bankAccount?: string; cleared?: boolean; clearedAt?: string };
  attachmentIds: string[];
  links: { captureId: string; relation: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface CaptureSummary {
  _id: string;
  title: string;
  type: CaptureType;
  amountMinor?: number;
  currency?: string;
  occurredAt?: string;
  counterparty?: string;
}

export interface CaptureDetail extends Capture {
  attachments: Attachment[];
  linked: CaptureSummary[];
  backlinks: CaptureSummary[];
}

export interface Schedule {
  _id: string;
  title: string;
  counterparty?: string;
  amountMinor?: number;
  currency: string;
  category?: string;
  property?: string;
  method?: string;
  notes?: string;
  frequency: { unit: "week" | "month" | "year"; interval: number };
  nextDueDate: string;
  reminderDaysBefore: number;
  lastPaidAt?: string;
  lastPaidBy?: string;
  claimedBy?: string;
  claimedAt?: string;
  active: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  didYouMean?: string;
}

export interface Template {
  count: number;
  label: string;
  values: Partial<Capture> & { method?: string; reimbursable?: boolean };
}

export interface Workspace {
  id: string;
  name: string;
  kind: "personal" | "family";
  defaultCurrency: string;
  role: "owner" | "editor" | "viewer";
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  timezone: string | null;
  preferences: { emailReminders: boolean; reminderEmail: string | null; weeklyDigest: boolean };
  createdAt: string;
  defaultWorkspaceId: string;
  workspaces: Workspace[];
}

export interface Dashboard {
  overdue: Schedule[];
  upcoming: Schedule[];
  recent: Capture[];
  inboxCount: number;
  reimbursementsOwed: { organization: string; currency: string; count: number; outstandingMinor: number }[];
  unclearedDeposits: Capture[];
  unreadNotifications: number;
  expiring: { kind: "expires" | "return" | "warranty"; date: string; id: string; title: string; type: CaptureType }[];
  setup: { captures: number; schedules: number; withProof: number };
}
