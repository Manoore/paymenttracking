export type FrequencyUnit = "week" | "month" | "year";

export interface Frequency {
  unit: FrequencyUnit;
  interval: number;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Advance a due date by one frequency step. Monthly/yearly schedules keep their
 * anchor day (e.g. the 31st) and clamp to the month's last day when needed, so a
 * bill due Jan 31 becomes Feb 28/29 and then returns to Mar 31.
 */
export function nextDueDate(current: Date, freq: Frequency, anchorDay?: number): Date {
  const d = new Date(current);
  const interval = Math.max(1, Math.floor(freq.interval));
  if (freq.unit === "week") {
    d.setUTCDate(d.getUTCDate() + 7 * interval);
    return d;
  }
  const months = freq.unit === "month" ? interval : interval * 12;
  const day = anchorDay ?? d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const clamped = Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
  target.setUTCDate(clamped);
  target.setUTCHours(d.getUTCHours(), d.getUTCMinutes(), 0, 0);
  return target;
}

export function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}
