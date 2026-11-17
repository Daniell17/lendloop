import { isCalendarDate } from "./dates";

const REMINDER_KEY = /^reminder:([A-Za-z0-9]+):(\d{4}-\d{2}-\d{2})$/;
const NOTIFY_KEY = /^notify:([A-Za-z0-9]+):([a-z_]+)$/;
const ERROR_KEY = /^error:[a-zA-Z0-9 _.:-]{1,120}:[A-Za-z0-9_.:-]{1,80}$/;

export function reminderKey(loanId: string, utcDate: string): string {
  return `reminder:${loanId}:${utcDate}`;
}

export function notificationKey(loanId: string, status: string): string {
  return `notify:${loanId}:${status}`;
}

export function errorKey(workflowName: string, executionId: string): string {
  const workflow = workflowName.replace(/[^a-zA-Z0-9 _.:-]/g, "").slice(0, 120);
  const execution = executionId.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80);
  return `error:${workflow}:${execution}`;
}

export function parseReminderKey(
  key: string,
  loanId: string,
): { ok: true; date: string } | { ok: false; reason: string } {
  const match = REMINDER_KEY.exec(key);
  if (!match || match[1] !== loanId || !isCalendarDate(match[2])) {
    return { ok: false, reason: "invalid_idempotency_key" };
  }
  return { ok: true, date: match[2] };
}

export function isNotificationKey(key: string, loanId: string, status: string): boolean {
  const match = NOTIFY_KEY.exec(key);
  return Boolean(match && match[1] === loanId && match[2] === status);
}

export function isErrorKey(key: string): boolean {
  return ERROR_KEY.test(key);
}

export function writeBackDecision(existing: unknown): "duplicate" | "insert" {
  return existing ? "duplicate" : "insert";
}
