export type CaptureType = "note" | "link" | "payment" | "expense" | "deposit";
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
  active: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
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
  preferences: { emailReminders: boolean; reminderEmail: string | null };
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
}
