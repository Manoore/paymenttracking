import { describe, expect, it } from "vitest";
import { nextDueDate } from "../src/lib/recurrence.js";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe("nextDueDate", () => {
  it("advances monthly and keeps the anchor day through short months", () => {
    let due = d("2026-01-31");
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      due = nextDueDate(due, { unit: "month", interval: 1 }, 31);
      seen.push(iso(due));
    }
    expect(seen).toEqual(["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("handles leap years for yearly schedules", () => {
    expect(iso(nextDueDate(d("2027-02-28"), { unit: "year", interval: 1 }, 29))).toBe("2028-02-29");
  });

  it("supports weekly and quarterly intervals", () => {
    expect(iso(nextDueDate(d("2026-09-28"), { unit: "week", interval: 2 }))).toBe("2026-10-12");
    expect(iso(nextDueDate(d("2026-11-15"), { unit: "month", interval: 3 }, 15))).toBe("2027-02-15");
  });
});
