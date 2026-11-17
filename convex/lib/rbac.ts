export type Role = "admin" | "user";

export type Actor = {
  userId: string;
  role: Role;
};

export type OwnedRecord = {
  ownerId: string;
};

export type LoanParties = {
  borrowerId: string;
  lenderId: string;
  status: string;
};

export function canCreateListing(actor: Actor | null): boolean {
  return actor !== null;
}

export function canEditListing(actor: Actor | null, tool: OwnedRecord): boolean {
  if (!actor) return false;
  return actor.userId === tool.ownerId;
}

export function canDeleteListing(actor: Actor | null, tool: OwnedRecord): boolean {
  if (!actor) return false;
  if (actor.role === "admin") return true;
  return actor.userId === tool.ownerId;
}

export function canRequestBorrow(actor: Actor | null, tool: OwnedRecord): boolean {
  if (!actor) return false;
  return actor.userId !== tool.ownerId;
}

export function canDecideRequest(actor: Actor | null, loan: LoanParties): boolean {
  if (!actor) return false;
  return loan.status === "pending" && actor.userId === loan.lenderId;
}

export function canCancelRequest(actor: Actor | null, loan: LoanParties): boolean {
  if (!actor) return false;
  return loan.status === "pending" && actor.userId === loan.borrowerId;
}

export function canMarkReturned(actor: Actor | null, loan: LoanParties): boolean {
  if (!actor) return false;
  if (loan.status !== "approved") return false;
  return actor.userId === loan.lenderId || actor.userId === loan.borrowerId;
}

export function canViewLoan(actor: Actor | null, loan: LoanParties): boolean {
  if (!actor) return false;
  if (actor.role === "admin") return true;
  return actor.userId === loan.lenderId || actor.userId === loan.borrowerId;
}

export function canViewAllLoans(actor: Actor | null): boolean {
  return actor?.role === "admin";
}

export function canMarkTrustedLender(actor: Actor | null): boolean {
  return actor?.role === "admin";
}

export function canAssignRole(): boolean {
  return false;
}
