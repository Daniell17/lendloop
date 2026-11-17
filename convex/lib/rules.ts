import { daysBetween, isCalendarDate, rangesOverlap, utcToday } from "./dates";

export const MAX_LOAN_DAYS = 90;

export type DatedLoan = {
  status: string;
  startDate: string;
  endDate: string;
  borrowerId?: string;
};

export function parseBorrowRange(
  startDate: string,
  endDate: string,
  now = Date.now(),
): { ok: true } | { ok: false; error: string } {
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) {
    return { ok: false, error: "Choose a real start and end date." };
  }
  if (endDate < startDate) {
    return { ok: false, error: "The end date has to be on or after the start date." };
  }
  if (startDate < utcToday(now)) {
    return { ok: false, error: "Loans start today or later (UTC dates)." };
  }
  const span = daysBetween(startDate, endDate) + 1;
  if (span > MAX_LOAN_DAYS) {
    return { ok: false, error: `A loan can run for at most ${MAX_LOAN_DAYS} days.` };
  }
  return { ok: true };
}

export function approvedOverlap(
  loans: DatedLoan[],
  startDate: string,
  endDate: string,
): boolean {
  return loans.some(
    (loan) =>
      loan.status === "approved" &&
      rangesOverlap(startDate, endDate, loan.startDate, loan.endDate),
  );
}

export function borrowerConflict(
  loans: DatedLoan[],
  borrowerId: string,
  startDate: string,
  endDate: string,
): string | null {
  for (const loan of loans) {
    if (loan.borrowerId !== borrowerId) continue;
    if (loan.status === "pending") {
      return "You already have a pending request for this tool.";
    }
    if (
      loan.status === "approved" &&
      rangesOverlap(startDate, endDate, loan.startDate, loan.endDate)
    ) {
      return "You already have this tool booked for those dates.";
    }
  }
  return null;
}

export function isOverdue(loan: DatedLoan, today: string): boolean {
  return loan.status === "approved" && loan.endDate < today;
}

export function hasOpenLoan(loans: Array<{ status: string }>): boolean {
  return loans.some((loan) => loan.status === "pending" || loan.status === "approved");
}

export function availabilityFor(
  loans: DatedLoan[],
  today: string,
): { state: "available" | "on_loan"; upcoming: boolean } {
  const approved = loans.filter((loan) => loan.status === "approved");
  const out = approved.some((loan) => loan.startDate <= today && today <= loan.endDate);
  if (out) return { state: "on_loan", upcoming: false };
  return {
    state: "available",
    upcoming: approved.some((loan) => loan.startDate > today),
  };
}

export function currentBooking(
  loans: DatedLoan[],
  today: string,
): { startDate: string; endDate: string } | null {
  return (
    loans.find(
      (loan) =>
        loan.status === "approved" && loan.startDate <= today && today <= loan.endDate,
    ) ?? null
  );
}

export function nextBooking(
  loans: DatedLoan[],
  today: string,
): { startDate: string; endDate: string } | null {
  const upcoming = loans
    .filter((loan) => loan.status === "approved" && loan.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return upcoming[0]
    ? { startDate: upcoming[0].startDate, endDate: upcoming[0].endDate }
    : null;
}
