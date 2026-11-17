import { describe, expect, test } from "vitest";
import { reminderActivityLabel } from "../convex/lib/activity";
import {
  errorKey,
  isErrorKey,
  notificationKey,
  parseReminderKey,
  reminderKey,
  writeBackDecision,
} from "../convex/lib/idempotency";
import { approvedOverlap, isOverdue, parseBorrowRange } from "../convex/lib/rules";

describe("idempotency keys", () => {
  test("reminder keys bind the loan and the UTC day", () => {
    const key = reminderKey("loan123", "2026-11-17");
    expect(parseReminderKey(key, "loan123")).toEqual({ ok: true, date: "2026-11-17" });
    expect(parseReminderKey(key, "other")).toEqual({
      ok: false,
      reason: "invalid_idempotency_key",
    });
    expect(parseReminderKey("reminder:loan123:2026-02-31", "loan123").ok).toBe(false);
  });

  test("a second write with the same key is a duplicate", () => {
    expect(writeBackDecision(null)).toBe("insert");
    expect(writeBackDecision({ idempotencyKey: "reminder:loan123:2026-11-17" })).toBe("duplicate");
  });

  test("notification and error keys stay scoped", () => {
    expect(notificationKey("loan123", "pending")).toBe("notify:loan123:pending");
    const key = errorKey("LendLoop Overdue Reminders", "exec-9");
    expect(isErrorKey(key)).toBe(true);
    expect(isErrorKey("error:")).toBe(false);
  });
});

describe("loan dates", () => {
  test("rejects a backwards or overly long range", () => {
    expect(parseBorrowRange("2026-11-20", "2026-11-18", Date.parse("2026-11-17T00:00:00Z")).ok).toBe(
      false,
    );
    expect(parseBorrowRange("2026-11-17", "2027-05-01", Date.parse("2026-11-17T00:00:00Z")).ok).toBe(
      false,
    );
    expect(parseBorrowRange("2026-11-17", "2026-11-20", Date.parse("2026-11-17T12:00:00Z")).ok).toBe(
      true,
    );
  });

  test("overlap and overdue follow approved loans only", () => {
    const loans = [
      { status: "approved", startDate: "2026-11-10", endDate: "2026-11-12" },
      { status: "pending", startDate: "2026-11-20", endDate: "2026-11-22" },
    ];
    expect(approvedOverlap(loans, "2026-11-12", "2026-11-13")).toBe(true);
    expect(approvedOverlap(loans, "2026-11-13", "2026-11-14")).toBe(false);
    expect(isOverdue(loans[0], "2026-11-13")).toBe(true);
    expect(isOverdue(loans[0], "2026-11-12")).toBe(false);
    expect(isOverdue(loans[1], "2026-12-01")).toBe(false);
  });
});

describe("reminder activity", () => {
  test("formats a two-day-old reminder", () => {
    const now = Date.parse("2026-11-17T15:00:00Z");
    const createdAt = now - 2 * 24 * 60 * 60 * 1000;
    expect(reminderActivityLabel(createdAt, now)).toBe("Reminder sent 2 days ago");
  });
});
